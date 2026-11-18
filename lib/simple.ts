import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import GraphemeSplitter from 'grapheme-splitter';
import {
    proto,
    delay,
    areJidsSameUser,
    generateWAMessage,
    generateWAMessageFromContent,
    downloadContentFromMessage,
    getContentType,
    getDevice,
    extractMessageContent,
    jidDecode
} from '@whiskeysockets/baileys';
import exif from './stickers.ts';
import db from '#db';
import { getSessionDir } from './settings.ts';
import { sendStickerPack } from './packmessage.ts';

const splitter = new GraphemeSplitter();
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = exif;

export class BoundedMap<K = string, V = any> {
    #map = new Map<K, { v: V; ts: number }>();
    #max: number;
    #ttl: number;

    constructor(max: number, ttlMs = 0) {
        this.#max = max;
        this.#ttl = ttlMs;
    }

    #expired(e: { v: V; ts: number }): boolean {
        return this.#ttl > 0 && Date.now() - e.ts > this.#ttl;
    }

    has(k: K): boolean {
        const e = this.#map.get(k);
        if (!e) return false;
        if (this.#expired(e)) {
            this.#map.delete(k);
            return false;
        }
        return true;
    }

    get(k: K): V | undefined {
        const e = this.#map.get(k);
        if (!e) return undefined;
        if (this.#expired(e)) {
            this.#map.delete(k);
            return undefined;
        }
        return e.v;
    }

    set(k: K, v: V): void {
        if (this.#map.size >= this.#max) {
            const first = this.#map.keys().next().value;
            if (first !== undefined) this.#map.delete(first);
        }
        this.#map.set(k, { v, ts: Date.now() });
    }
}

const groupMetaCache = new Map<string, { metadata: any; ts: number }>();
export const lidCache = new BoundedMap<string, string>(5000, 24 * 60 * 60_000);
const META_TTL = 300_000;

const gcMeta = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of groupMetaCache) {
        if (now - val.ts > META_TTL) groupMetaCache.delete(key);
    }
}, 10 * 60 * 1000);
gcMeta.unref();

export function getCachedMeta(groupJid: string): any {
    const c = groupMetaCache.get(groupJid);
    if (!c || Date.now() - c.ts > META_TTL) return null;
    return c.metadata;
}

export function setCachedMeta(groupJid: string, metadata: any): void {
    groupMetaCache.set(groupJid, { metadata, ts: Date.now() });
}

export function deleteCachedMeta(groupJid: string): void {
    groupMetaCache.delete(groupJid);
}

export const decodeJid = (jid: any): string => {
    if (!jid || typeof jid !== 'string') return '';
    if (/:\d+@/i.test(jid)) {
        const decoded = jidDecode(jid);
        return decoded?.user && decoded?.server ? `${decoded.user}@${decoded.server}` : jid;
    }
    return jid;
};

export function normalizeJid(raw: any): string | null {
    if (!raw) return null;
    const s = typeof raw === 'number' ? String(raw) : String(raw).trim();
    if (!s) return null;
    if (s.endsWith('@g.us') || s.endsWith('@newsletter') || s.endsWith('@lid')) return s;
    if (/:\d+@/i.test(s)) {
        const decoded = jidDecode(s);
        if (decoded?.user && decoded?.server) return `${decoded.user}@${decoded.server}`;
    }
    if (s.endsWith('@s.whatsapp.net')) return s;
    const digits = s.replace(/\D/g, '');
    if (digits && digits.length >= 4 && digits.length <= 15) return `${digits}@s.whatsapp.net`;
    return s;
}

function lookupLidFromSession(lidNumber: string, sock?: any): string | null {
    if (sock?.signalRepository?.lidMapping) {
        try {
            const cachedPn = sock.signalRepository.lidMapping.mappingCache?.get(`lid:${lidNumber}`);
            if (cachedPn) return `${cachedPn}@s.whatsapp.net`;
        } catch {}
    }
    if (typeof sock?.findJidByLid === 'function') {
        try {
            const found = sock.findJidByLid(`${lidNumber}@lid`);
            if (found && !found.endsWith('@lid')) {
                const n = normalizeJid(found);
                if (n) return n;
            }
        } catch {}
    }
    const baseDir = sock?.sessionFolder || getSessionDir();
    const mappingFile = path.join(baseDir, `lid-mapping-${lidNumber}_reverse.json`);
    try {
        if (fs.existsSync(mappingFile)) {
            const phoneStr = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
            if (phoneStr) return `${phoneStr}@s.whatsapp.net`;
        }
    } catch {}
    return null;
}

export function resolveJidSync(raw: any, sock?: any): string | null {
    if (!raw) return null;
    const norm = normalizeJid(raw);
    if (!norm) return null;
    if (!norm.endsWith('@lid')) return norm;
    const cached = lidCache.get(norm);
    if (cached) return cached;
    const lidNum = norm.split('@')[0];
    const found = lookupLidFromSession(lidNum, sock);
    if (found) {
        lidCache.set(norm, found);
        return found;
    }
    return norm;
}

export const UserJid = (sock: any, chat?: string, jid?: string): string => {
    const target = jid || chat;
    if (!target || typeof target !== 'string') return '';
    return resolveJidSync(target, sock) || target;
};

export function resolveParticipantJid(p: any, sock?: any): string | null {
    if (!p) return null;
    for (const candidate of [p.phoneNumber, p.id, p.jid]) {
        if (candidate && !String(candidate).endsWith('@lid')) {
            const n = normalizeJid(candidate);
            if (n && !n.endsWith('@lid')) return n;
        }
    }
    const rawLid = p.lid || (p.id?.endsWith('@lid') ? p.id : null) || (p.jid?.endsWith('@lid') ? p.jid : null);
    if (rawLid) return resolveJidSync(rawLid, sock);
    return null;
}

function resolveParticipants(participants: any[], sock?: any): any[] {
    if (!Array.isArray(participants)) return [];
    return participants
        .map(p => {
            const realJid = resolveParticipantJid(p, sock);
            if (!realJid) return p;
            const originalLid =
                p.lid || (p.id?.endsWith('@lid') ? p.id : undefined) || (p.jid?.endsWith('@lid') ? p.jid : undefined);
            if (originalLid && !realJid.endsWith('@lid')) lidCache.set(originalLid, realJid);
            return {
                ...p,
                id: realJid,
                ...(originalLid ? { lid: originalLid } : {}),
                ...(p.phoneNumber ? { phoneNumber: p.phoneNumber } : {})
            };
        })
        .filter(p => p?.id);
}

async function resolveJidAsync(raw: any, sock: any, groupJid?: string | null): Promise<string> {
    if (!raw) return '';
    const norm = normalizeJid(raw);
    if (!norm) return '';
    if (!norm.endsWith('@lid')) return norm;
    const sync = resolveJidSync(norm, sock);
    if (sync && !sync.endsWith('@lid')) return sync;
    if (!groupJid?.endsWith('@g.us')) return norm;
    const lidBase = norm.split('@')[0];
    let meta = getCachedMeta(groupJid);
    if (!meta) {
        try {
            meta = await sock.groupMetadata(groupJid);
            if (meta?.participants) setCachedMeta(groupJid, meta);
            else meta = null;
        } catch {
            return norm;
        }
    }
    for (const p of meta?.participants ?? []) {
        const pLidBase = p.lid?.split('@')[0];
        const pIdBase = p.id && !p.id.endsWith('@lid') ? p.id.split('@')[0] : null;
        if (pLidBase !== lidBase && pIdBase !== lidBase) continue;
        const phone = p.phoneNumber
            ? normalizeJid(p.phoneNumber)
            : p.id && !p.id.endsWith('@lid')
                ? normalizeJid(p.id)
                : null;
        if (phone) {
            lidCache.set(norm, phone);
            return phone;
        }
    }
    return norm;
}

export function patchGroupMetadata(sock: any): void {
    if (!sock || sock.groupMetadataPatched || typeof sock.groupMetadata !== 'function') return;
    sock.groupMetadataPatched = true;
    const orig = sock.groupMetadata.bind(sock);
    sock.groupMetadata = async (jid: string) => {
        try {
            const cached = getCachedMeta(jid);
            if (cached) return cached;
            const meta = await orig(jid);
            if (!meta?.participants) return meta;
            meta.participants = resolveParticipants(meta.participants, sock);
            setCachedMeta(jid, meta);
            return meta;
        } catch {
            return null;
        }
    };
}

export async function getBuffer(url: string, options: any = {}): Promise<Buffer> {
    const res = await axios({
        method: 'get',
        url,
        headers: { DNT: 1, 'Upgrade-Insecure-Request': 1 },
        responseType: 'arraybuffer',
        timeout: 30_000,
        ...options
    });
    return Buffer.from(res.data);
}

// Respuesta de un menú interactivo (nativeFlow): extrae el comando seleccionado.
function extractNativeFlowId(msgContent: any): string {
    const params =
        msgContent?.nativeFlowResponseMessage?.paramsJson ||
        msgContent?.paramsJson;
    if (!params || typeof params !== 'string') return '';
    try {
        const id = JSON.parse(params)?.id;
        return typeof id === 'string' ? id : '';
    } catch {
        return '';
    }
}

function unwrapContent(message: any): any {
    if (!message || typeof message !== 'object') return message;
    let raw = message;
    if (raw.ephemeralMessage?.message) raw = raw.ephemeralMessage.message;
    if (raw.viewOnceMessage?.message) raw = raw.viewOnceMessage.message;
    if (raw.viewOnceMessageV2?.message) raw = raw.viewOnceMessageV2.message;
    if (raw.viewOnceMessageV2Extension?.message) raw = raw.viewOnceMessageV2Extension.message;
    if (raw.documentWithCaptionMessage?.message) raw = raw.documentWithCaptionMessage.message;
    if (raw.editedMessage?.message?.protocolMessage?.editedMessage) {
        raw = raw.editedMessage.message.protocolMessage.editedMessage;
    } else if (raw.editedMessage?.message) {
        raw = raw.editedMessage.message;
    }
    return raw;
}

async function renderThumb(webpBuf: Buffer, size: number, format: 'png' | 'jpg'): Promise<Buffer> {
    const tag = crypto.randomBytes(6).toString('hex');
    const inFile = path.join(os.tmpdir(), `denji-pk-in-${tag}.webp`);
    const outFile = path.join(os.tmpdir(), `denji-pk-out-${tag}.${format}`);
    await fs.promises.writeFile(inFile, webpBuf);
    try {
        await new Promise<void>((resolve, reject) => {
            const vf =
                format === 'png'
                    ? `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`
                    : `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=white`;
            const proc = spawn('ffmpeg', ['-y', '-i', inFile, '-frames:v', '1', '-vf', vf, outFile], {
                stdio: ['ignore', 'ignore', 'pipe']
            });
            proc.on('error', reject);
            proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
        });
        return await fs.promises.readFile(outFile);
    } finally {
        await fs.promises.unlink(inFile).catch(() => {});
        await fs.promises.unlink(outFile).catch(() => {});
    }
}

export async function sendNativeStickerPack(
    sock: any,
    jid: string,
    packSpec: {
        name: string;
        publisher: string;
        description?: string;
        cover?: Buffer;
        stickers: { sticker?: Buffer; url?: string; isAnimated?: boolean; emojis?: string[] }[];
    },
    quoted?: any
): Promise<any> {
    const resolved: { webp: Buffer; animated: boolean; emojis: string[] }[] = [];
    for (const item of packSpec.stickers.slice(0, 50)) {
        try {
            let buf: Buffer | null = null;
            if (Buffer.isBuffer(item.sticker)) {
                buf = item.sticker;
            } else if (item.url) {
                const raw = await getBuffer(item.url, { timeout: 15_000 });
                const ft = await fileTypeFromBuffer(raw);
                buf = ft?.mime === 'image/webp' ? raw : await imageToWebp(raw);
            }
            if (buf && buf.length > 0) {
                resolved.push({
                    webp: buf,
                    animated: Boolean(item.isAnimated),
                    emojis: item.emojis?.length ? item.emojis : ['🎭']
                });
            }
        } catch {}
    }
    if (!resolved.length) throw new Error('No se pudieron preparar los stickers del paquete.');
    const coverSrc = Buffer.isBuffer(packSpec.cover) ? packSpec.cover : resolved[0].webp;
    const [trayPng, thumbnailJpeg] = await Promise.all([
        renderThumb(coverSrc, 96, 'png'),
        renderThumb(coverSrc, 252, 'jpg')
    ]);
    return sendStickerPack(
        sock,
        jid,
        {
            name: packSpec.name || 'Stickers',
            publisher: packSpec.publisher || 'Denji bot',
            description: packSpec.description || '',
            stickers: resolved,
            trayPng,
            thumbnailJpeg
        },
        quoted
    );
}

function attachSockHelpers(sock: any): void {
    if (!sock) return;

    if (!sock.decodeJid) {
        sock.decodeJid = decodeJid;
    }

    patchGroupMetadata(sock);

    if (!sock.downloadMediaMessage) {
        sock.downloadMediaMessage = async (message: any): Promise<Buffer> => {
            const m = message?.msg || message;
            const mime = m?.mimetype || '';
            const messageType = String(message?.type || mime.split('/')[0] || '')
                .replace(/Message/gi, '')
                .toLowerCase();
            const stream = await downloadContentFromMessage(m, messageType as any);
            const chunks: Buffer[] = [];
            for await (const chunk of stream) chunks.push(chunk as Buffer);
            return Buffer.concat(chunks);
        };
    }

    if (!sock.parseMention) {
        sock.parseMention = async (text = '') =>
            [...String(text).matchAll(/@([0-9]{5,16}|0)/g)].map(v => `${v[1]}@s.whatsapp.net`);
    }

    if (!sock.sendImageAsSticker) {
        sock.sendImageAsSticker = async (jid: string, p: any, quoted?: any, options: any = {}) => {
            const buff = Buffer.isBuffer(p)
                ? p
                : /^data:.*?\/.*?;base64,/i.test(p)
                    ? Buffer.from(String(p).split(',')[1], 'base64')
                    : /^https?:\/\//.test(p)
                        ? await getBuffer(p)
                        : fs.existsSync(p)
                            ? fs.readFileSync(p)
                            : Buffer.alloc(0);
            if (options?.packname || options?.author) {
                const filePath = await writeExifImg(buff, options);
                try {
                    await sock.sendMessage(jid, { sticker: { url: filePath }, ...options }, { quoted });
                    return filePath;
                } finally {
                    if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
                }
            }
            const webpBuf = await imageToWebp(buff);
            await sock.sendMessage(jid, { sticker: webpBuf, ...options }, { quoted });
            return webpBuf;
        };
    }

    if (!sock.sendVideoAsSticker) {
        sock.sendVideoAsSticker = async (jid: string, p: any, quoted?: any, options: any = {}) => {
            const buff = Buffer.isBuffer(p)
                ? p
                : /^data:.*?\/.*?;base64,/i.test(p)
                    ? Buffer.from(String(p).split(',')[1], 'base64')
                    : /^https?:\/\//.test(p)
                        ? await getBuffer(p)
                        : fs.existsSync(p)
                            ? fs.readFileSync(p)
                            : Buffer.alloc(0);
            if (options?.packname || options?.author) {
                const filePath = await writeExifVid(buff, options);
                try {
                    await sock.sendMessage(jid, { sticker: { url: filePath }, ...options }, { quoted });
                    return filePath;
                } finally {
                    if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
                }
            }
            const webpBuf = await videoToWebp(buff);
            await sock.sendMessage(jid, { sticker: webpBuf, ...options }, { quoted });
            return webpBuf;
        };
    }

    if (!sock.sendFile) {
        sock.sendFile = async (
            jid: string,
            p: any,
            filename = 'file',
            caption = '',
            quoted: any = null,
            ptt = false,
            options: any = {}
        ) => {
            let buffer: Buffer;
            if (Buffer.isBuffer(p)) buffer = p;
            else if (/^https?:\/\//.test(p)) buffer = await getBuffer(p);
            else if (fs.existsSync(p)) buffer = fs.readFileSync(p);
            else throw new Error('Ruta o buffer inválido');

            const type = (await fileTypeFromBuffer(buffer)) ?? { mime: 'application/octet-stream', ext: 'bin' };
            const mimetype = options.mimetype ?? type.mime;
            let mtype = 'document';
            if (/webp/i.test(type.mime)) mtype = 'sticker';
            else if (/image/i.test(type.mime)) mtype = 'image';
            else if (/video/i.test(type.mime)) mtype = 'video';
            else if (/audio/i.test(type.mime)) mtype = 'audio';
            if (options.asDocument) mtype = 'document';
            const clean = { ...options };
            for (const k of ['asDocument', 'asSticker', 'asImage', 'asVideo']) delete clean[k];
            return sock.sendMessage(jid, { ...clean, caption, ptt, [mtype]: buffer, mimetype, fileName: filename }, { quoted });
        };
    }

    if (!sock.sendAlbumMessage) {
        sock.sendAlbumMessage = async (jid: string, medias: any[], options: any = {}) => {
            if (typeof jid !== 'string') throw new TypeError(`jid must be string, received: ${jid}`);
            if (!Array.isArray(medias) || medias.length < 2) throw new RangeError('Minimum 2 media required');
            const delayMs = !isNaN(options.delay) ? Number(options.delay) : 500;
            const quoted = options.quoted;
            try {
                const album = generateWAMessageFromContent(
                    jid,
                    {
                        messageContextInfo: {},
                        albumMessage: {
                            expectedImageCount: medias.filter(m => m.type === 'image').length,
                            expectedVideoCount: medias.filter(m => m.type === 'video').length,
                            ...(quoted?.key
                                ? {
                                      contextInfo: {
                                          remoteJid: quoted.key.remoteJid,
                                          fromMe: quoted.key.fromMe,
                                          stanzaId: quoted.key.id,
                                          participant: quoted.key.participant || quoted.key.remoteJid,
                                          quotedMessage: quoted.message
                                      }
                                  }
                                : {})
                        }
                    } as any,
                    { userJid: sock.user?.id } as any
                );
                await sock.relayMessage(album.key.remoteJid!, album.message!, { messageId: album.key.id! });
                for (const { type, data, caption } of medias) {
                    const mediaMsg = await generateWAMessage(
                        album.key.remoteJid!,
                        { [type]: data, ...(caption ? { caption } : {}) } as any,
                        { userJid: sock.user?.id || jid, upload: sock.waUploadToServer }
                    );
                    if (mediaMsg.message) {
                        mediaMsg.message.messageContextInfo = {
                            messageAssociation: { associationType: 1, parentMessageKey: album.key }
                        } as any;
                        await sock.relayMessage(mediaMsg.key.remoteJid!, mediaMsg.message, { messageId: mediaMsg.key.id! });
                    }
                    await delay(delayMs);
                }
                return album;
            } catch {
                // Respaldo: enviar las primeras imágenes individualmente si falla el álbum.
                let last: any = null;
                for (const { type, data, caption } of medias.slice(0, 5)) {
                    last = await sock.sendMessage(jid, { [type]: data, ...(caption ? { caption } : {}) }, { quoted });
                    await delay(delayMs);
                }
                return last;
            }
        };
    }

    if (!sock.sendCodeMessage) {
        sock.sendCodeMessage = async (jid: string, filename: string, code: any, quoted?: any, tableData?: any) => {
            const KEYWORDS = new Set([
                'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
                'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
                'in', 'instanceof', 'let', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw',
                'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'async', 'await', 'static'
            ]);
            const METHOD_NAMES = new Set([
                'log', 'parse', 'stringify', 'from', 'toString', 'readFileSync', 'existsSync', 'statSync',
                'resolve', 'join', 'randomUUID', 'randomBytes', 'startsWith', 'replace', 'trim', 'isFile',
                'relayMessage', 'sendMessage'
            ]);
            function tokenize(src: string) {
                const tokens: { content: string; type: string }[] = [];
                let i = 0;
                const push = (content: string, type = 'DEFAULT') => {
                    if (content) tokens.push({ content, type });
                };
                while (i < src.length) {
                    const ch = src[i];
                    const rest = src.slice(i);
                    if (rest.startsWith('//')) {
                        let j = i + 2;
                        while (j < src.length && src[j] !== '\n') j++;
                        push(src.slice(i, j), 'DEFAULT');
                        i = j;
                        continue;
                    }
                    if (rest.startsWith('/*')) {
                        let j = i + 2;
                        while (j < src.length - 1 && !(src[j] === '*' && src[j + 1] === '/')) j++;
                        j = Math.min(j + 2, src.length);
                        push(src.slice(i, j), 'DEFAULT');
                        i = j;
                        continue;
                    }
                    if (ch === "'" || ch === '"' || ch === '`') {
                        const quote = ch;
                        let j = i + 1;
                        let escaped = false;
                        while (j < src.length) {
                            const c = src[j];
                            if (escaped) escaped = false;
                            else if (c === '\\') escaped = true;
                            else if (c === quote) { j++; break; }
                            j++;
                        }
                        push(src.slice(i, j), 'STR');
                        i = j;
                        continue;
                    }
                    if (/[0-9]/.test(ch)) {
                        let j = i + 1;
                        while (j < src.length && /[0-9._]/.test(src[j])) j++;
                        push(src.slice(i, j), 'NUMBER');
                        i = j;
                        continue;
                    }
                    if (/[A-Za-z_$]/.test(ch)) {
                        let j = i + 1;
                        while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
                        const word = src.slice(i, j);
                        const next = src[j] || '';
                        const prev = src[i - 1] || '';
                        if (KEYWORDS.has(word)) push(word, 'KEYWORD');
                        else if ((METHOD_NAMES.has(word) || next === '(') && prev === '.') push(word, 'METHOD');
                        else if (METHOD_NAMES.has(word) && next === '(') push(word, 'METHOD');
                        else push(word, 'DEFAULT');
                        i = j;
                        continue;
                    }
                    push(ch, 'DEFAULT');
                    i++;
                }
                const merged: { content: string; type: string }[] = [];
                for (const token of tokens) {
                    const last = merged[merged.length - 1];
                    if (last?.type === 'DEFAULT' && token.type === 'DEFAULT') last.content += token.content;
                    else merged.push({ ...token });
                }
                return merged;
            }
            try {
                const codeBlocks = Array.isArray(code) ? code : tokenize(String(code));
                const sections: any[] = [];
                const submessages: any[] = [];
                sections.push({
                    view_model: {
                        primitive: { text: filename, __typename: 'GenAIMarkdownTextUXPrimitive' },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                });
                if (tableData) {
                    const tableRows = [
                        { items: tableData.headers, isHeading: true },
                        ...tableData.rows.map((r: any[]) => ({ items: r.map(String) }))
                    ];
                    submessages.push({ messageType: 4, tableMetadata: { title: tableData.title, rows: tableRows } });
                    sections.push({
                        view_model: {
                            primitive: {
                                title: tableData.title,
                                rows: tableRows.map((row: any) => ({
                                    is_header: row.isHeading ?? false,
                                    cells: row.items,
                                    markdown_cells: []
                                })),
                                __typename: 'GenATableUXPrimitive'
                            },
                            __typename: 'GenAISingleLayoutViewModel'
                        }
                    });
                }
                sections.push({
                    view_model: {
                        primitive: { language: 'javascript', code_blocks: codeBlocks, __typename: 'GenAICodeUXPrimitive' },
                        __typename: 'GenAISingleLayoutViewModel'
                    }
                });
                const payload = { response_id: crypto.randomUUID(), sections };
                const content = {
                    messageContextInfo: {
                        threadId: [],
                        deviceListMetadata: {
                            senderKeyIndexes: [],
                            recipientKeyIndexes: [],
                            recipientKeyHash: '',
                            recipientTimestamp: Math.floor(Date.now() / 1000)
                        },
                        deviceListMetadataVersion: 2,
                        messageSecret: crypto.randomBytes(32).toString('base64')
                    },
                    botForwardedMessage: {
                        message: {
                            richResponseMessage: {
                                submessages,
                                messageType: 1,
                                unifiedResponse: { data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') },
                                contextInfo: {
                                    mentionedJid: [],
                                    groupMentions: [],
                                    statusAttributions: [],
                                    forwardingScore: 2,
                                    isForwarded: true,
                                    forwardedAiBotMessageInfo: { botJid: '259786046210223@bot' },
                                    forwardOrigin: 4,
                                    botMessageSharingInfo: { botEntryPointOrigin: 1, forwardScore: 2 }
                                }
                            }
                        }
                    }
                };
                return await sock.relayMessage(jid, content, {});
            } catch {
                return sock.sendMessage(jid, { text: `\`\`\`\n${String(code)}\n\`\`\`` }, { quoted });
            }
        };
    }

    if (!sock.sendStickerPackMessage) {
        sock.sendStickerPackMessage = (jid: string, spec: any, quoted?: any) =>
            sendNativeStickerPack(sock, jid, spec, quoted);
    }

    if (!sock.reply) {
        sock.reply = async (jid: string, text: any = '', quoted?: any, options: any = {}) =>
            Buffer.isBuffer(text)
                ? sock.sendFile(jid, text, 'file', '', quoted, false, options)
                : sock.sendMessage(jid, { ...options, text: String(text) }, { quoted, ...options });
    }

    if (!sock.sendText) {
        sock.sendText = (jid: string, text: string, quoted: any = '', options: any = {}) =>
            sock.sendMessage(jid, { text, ...options }, { quoted });
    }
}

export async function smsg(sock: any, msg: any): Promise<any> {
    if (!msg) return msg;
    attachSockHelpers(sock);

    const botRaw = sock?.user?.id || '';
    const botId = botRaw ? `${botRaw.split('@')[0].split(':')[0]}@s.whatsapp.net` : '';
    const botSetting = botId ? db.getSettings(botId) : { prefix: ['.'] };

    if (msg.key) {
        msg.id = msg.key.id || '';
        msg.chat = msg.key.remoteJid || '';
        msg.fromMe = Boolean(msg.key.fromMe);
        msg.isBot =
            ['HSK', 'BAE', 'B1E', '3EB0', 'B24E', 'WA'].some(
                a => msg.id.startsWith(a) && [12, 16, 20, 22, 40].includes(msg.id.length)
            ) || false;
        msg.isGroup = msg.chat.endsWith('@g.us');
        if (!msg.isGroup && msg.chat.endsWith('@lid')) {
            const resolved = await resolveJidAsync(msg.chat, sock, null);
            if (resolved && !resolved.endsWith('@lid')) msg.chat = resolved;
        }
        msg.from = msg.chat;
        const rawSender = (msg.fromMe && sock?.user?.id) || msg.key.participant || msg.key.remoteJid || '';
        msg.sender = await resolveJidAsync(decodeJid(rawSender), sock, msg.key.remoteJid);
    }

    if (msg.message) {
        const unwrapped = unwrapContent(msg.message);
        msg.type = getContentType(unwrapped) || Object.keys(unwrapped)[0] || '';
        msg.msg = (extractMessageContent(unwrapped?.[msg.type]) as any) || unwrapped?.[msg.type] || {};

        const flowId = extractNativeFlowId(msg.msg) || extractNativeFlowId(unwrapped?.interactiveResponseMessage);

        msg.body =
            flowId ||
            unwrapped?.conversation ||
            msg.msg?.text ||
            msg.msg?.conversation ||
            msg.msg?.caption ||
            msg.msg?.selectedButtonId ||
            msg.msg?.singleSelectReply?.selectedRowId ||
            msg.msg?.selectedId ||
            msg.msg?.contentText ||
            msg.msg?.selectedDisplayText ||
            msg.msg?.title ||
            msg.msg?.name ||
            '';

        msg.text =
            flowId ||
            msg.msg?.text ||
            msg.msg?.caption ||
            unwrapped?.conversation ||
            msg.msg?.selectedButtonId ||
            msg.msg?.singleSelectReply?.selectedRowId ||
            msg.msg?.selectedId ||
            msg.msg?.contentText ||
            msg.msg?.selectedDisplayText ||
            msg.msg?.title ||
            '';

        const rawMentioned: string[] = msg.msg?.contextInfo?.mentionedJid ?? [];
        let metaParticipants: any[] | null = null;
        if (msg.isGroup && rawMentioned.some(j => j?.endsWith('@lid'))) {
            try {
                const meta = getCachedMeta(msg.chat) ?? (await sock.groupMetadata(msg.chat).catch(() => null));
                if (meta) setCachedMeta(msg.chat, meta);
                metaParticipants = meta?.participants ?? null;
            } catch {}
        }
        const resolveMentionJid = (raw: string): string | null => {
            if (!raw) return null;
            const norm = normalizeJid(raw);
            if (!norm) return null;
            if (!norm.endsWith('@lid')) return norm;
            const sync = resolveJidSync(norm, sock);
            if (sync && !sync.endsWith('@lid')) return sync;
            if (metaParticipants) {
                const lidBase = norm.split('@')[0];
                for (const p of metaParticipants) {
                    if (p.lid?.split('@')[0] === lidBase || p.id?.split('@')[0] === lidBase) return p.id;
                }
            }
            return norm;
        };
        msg.mentionedJid = rawMentioned.map(resolveMentionJid).filter(Boolean);

        let activePrefixes: string[] = [];
        if (botSetting.prefix === 1) activePrefixes = [];
        else if (Array.isArray(botSetting.prefix)) activePrefixes = botSetting.prefix;
        else if (typeof botSetting.prefix === 'string') activePrefixes = splitter.splitGraphemes(botSetting.prefix);
        else activePrefixes = ['.', '/', '!', '#'];

        msg.usedPrefix = '';
        for (const p of activePrefixes) {
            if (p && msg.body?.startsWith(p)) {
                msg.usedPrefix = p;
                break;
            }
        }
        msg.command = msg.body ? msg.body.slice(msg.usedPrefix.length).trim().split(/ +/).shift() || '' : '';
        msg.args = msg.body
            ? msg.body
                  .slice(msg.usedPrefix.length)
                  .trim()
                  .split(/ +/)
                  .slice(1)
                  .filter(Boolean)
            : [];
        msg.device = msg.id ? getDevice(msg.id) : 'unknown';
        msg.expiration = msg.msg?.contextInfo?.expiration || 0;
        msg.timestamp =
            typeof msg.messageTimestamp === 'number'
                ? msg.messageTimestamp
                : msg.messageTimestamp?.low || msg.messageTimestamp?.high || Math.floor(Date.now() / 1000);
        msg.isMedia = Boolean(msg.msg?.mimetype || msg.msg?.thumbnailDirectPath);
        if (msg.isMedia) {
            msg.mime = msg.msg?.mimetype || '';
            msg.size = msg.msg?.fileLength;
            msg.height = msg.msg?.height || '';
            msg.width = msg.msg?.width || '';
            if (/webp/i.test(msg.mime)) msg.isAnimated = Boolean(msg.msg?.isAnimated);
        }

        const ctxInfo = msg.msg?.contextInfo;
        msg.quoted = ctxInfo?.quotedMessage ? {} : null;
        if (msg.quoted) {
            const rawQuoted = unwrapContent(ctxInfo.quotedMessage);
            msg.quoted.message = extractMessageContent(ctxInfo.quotedMessage) || rawQuoted;
            msg.quoted.type = getContentType(msg.quoted.message) || Object.keys(msg.quoted.message || {})[0] || '';
            msg.quoted.msg =
                (extractMessageContent(msg.quoted.message?.[msg.quoted.type]) as any) ||
                msg.quoted.message?.[msg.quoted.type] ||
                {};
            msg.quoted.id = ctxInfo.stanzaId || '';
            msg.quoted.device = msg.quoted.id ? getDevice(msg.quoted.id) : 'unknown';
            msg.quoted.chat = ctxInfo.remoteJid || msg.chat;
            msg.quoted.isBot = msg.quoted.id
                ? ['HSK', 'BAE', 'B1E', '3EB0', 'B24E', 'WA'].some(
                      a => msg.quoted.id.startsWith(a) && [12, 16, 20, 22, 40].includes(msg.quoted.id.length)
                  )
                : false;
            const rawQP = ctxInfo.participant ?? '';
            msg.quoted.sender = await resolveJidAsync(decodeJid(rawQP), sock, msg.chat);
            msg.quoted.fromMe = sock?.user?.id
                ? areJidsSameUser(msg.quoted.sender, decodeJid(sock.user.id))
                : false;
            msg.quoted.text =
                msg.quoted.msg?.text ||
                msg.quoted.msg?.caption ||
                msg.quoted.message?.conversation ||
                msg.quoted.msg?.conversation ||
                msg.quoted.msg?.contentText ||
                msg.quoted.msg?.selectedDisplayText ||
                msg.quoted.msg?.title ||
                '';
            msg.quoted.body =
                msg.quoted.text ||
                msg.quoted.msg?.selectedButtonId ||
                msg.quoted.msg?.singleSelectReply?.selectedRowId ||
                msg.quoted.msg?.selectedId ||
                msg.quoted.msg?.name ||
                '';
            msg.quoted.mentionedJid = (msg.quoted.msg?.contextInfo?.mentionedJid ?? [])
                .map(resolveMentionJid)
                .filter(Boolean);
            msg.quoted.mentions = msg.quoted.mentionedJid;
            msg.quoted.isGroup = Boolean(msg.quoted.chat?.endsWith('@g.us'));
            let quotedPrefix = '';
            for (const p of activePrefixes) {
                if (p && msg.quoted.body?.startsWith(p)) {
                    quotedPrefix = p;
                    break;
                }
            }
            msg.quoted.usedPrefix = quotedPrefix;
            msg.quoted.command = msg.quoted.body
                ? msg.quoted.body.slice(quotedPrefix.length).trim().split(/ +/).shift() || ''
                : '';
            msg.quoted.isMedia = Boolean(msg.quoted.msg?.mimetype || msg.quoted.msg?.thumbnailDirectPath);
            if (msg.quoted.isMedia) {
                msg.quoted.mimetype = msg.quoted.msg?.mimetype || '';
                msg.quoted.mime = msg.quoted.mimetype;
                msg.quoted.size = msg.quoted.msg?.fileLength;
                msg.quoted.height = msg.quoted.msg?.height || '';
                msg.quoted.width = msg.quoted.msg?.width || '';
                if (/webp/i.test(msg.quoted.mime)) msg.quoted.isAnimated = Boolean(msg.quoted.msg?.isAnimated);
            }
            msg.quoted.key = {
                remoteJid: ctxInfo.remoteJid || msg.chat,
                participant: msg.quoted.sender,
                fromMe: msg.quoted.fromMe,
                id: ctxInfo.stanzaId
            };
            msg.quoted.fakeObj = proto.WebMessageInfo.fromObject({
                key: { remoteJid: msg.quoted.chat, fromMe: msg.quoted.fromMe, id: msg.quoted.id },
                message: msg.quoted.message,
                ...(msg.isGroup ? { participant: msg.quoted.sender } : {})
            });
            msg.quoted.download = () => sock.downloadMediaMessage(msg.quoted);
            msg.quoted.delete = () =>
                sock.sendMessage(msg.quoted.chat, {
                    delete: {
                        remoteJid: msg.quoted.chat,
                        fromMe: msg.quoted.fromMe,
                        id: msg.quoted.id,
                        participant: msg.quoted.sender
                    }
                });
        }
    }

    msg.download = () => sock.downloadMediaMessage(msg);
    msg.react = (emoji: string) => sock.sendMessage(msg.chat, { react: { text: emoji, key: msg.key } });
    msg.reply = async (content: any, options: any = {}) => {
        const quoted = msg;
        const chat = msg.chat;
        const ephemeralExpiration = msg.expiration;
        if (content && typeof content === 'object') {
            return sock.sendMessage(chat, content, { ...options, quoted, ephemeralExpiration });
        }
        return sock.sendMessage(chat, { text: String(content ?? ''), ...options }, { quoted, ephemeralExpiration });
    };

    return msg;
}

export function serialize(sock: any, m: proto.IWebMessageInfo): any {
    if (!m || typeof m !== 'object' || !m.message) return null;
    const unwrapped = unwrapContent(m.message);
    const msgType = getContentType(unwrapped) || '';
    if (!msgType) return null;
    const content: any = unwrapped[msgType];
    const body =
        extractNativeFlowId(content) ||
        unwrapped.conversation ||
        content?.text ||
        content?.caption ||
        '';
    const key = m.key || {};
    const chat = UserJid(sock, decodeJid(key.remoteJid || ''));
    const sender = UserJid(sock, chat, decodeJid(key.participant || key.remoteJid || ''));
    return {
        ...m,
        type: msgType,
        msg: content,
        body,
        text: body,
        chat,
        from: chat,
        sender,
        isGroup: chat.endsWith('@g.us'),
        isBot: Boolean(key.fromMe)
    };
}
