import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import {
    proto,
    delay,
    S_WHATSAPP_NET,
    areJidsSameUser,
    downloadContentFromMessage,
    getContentType,
    getDevice,
    extractMessageContent,
    jidDecode,
    jidNormalizedUser
} from '@whiskeysockets/baileys';
import exif from './stickers.ts';
import db from '#db';
import { getSessionDir } from './settings.ts';
import { sendStickerPack } from './packmessage.ts';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const splitGraphemes = (input: string): string[] =>
    Array.from(graphemeSegmenter.segment(String(input || '')), s => s.segment);
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid, resizeToJpeg, runFfmpeg } = exif;

export const DEFAULT_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

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

// Caché separada: `rawGroupMetaCache` conserva los JID originales (@lid/@s.whatsapp.net)
// que Baileys v7 necesita para cifrar mensajes en grupos LID; `groupMetaCache` guarda la
// copia normalizada (@s.whatsapp.net) para plugins y permisos.
const rawGroupMetaCache = new Map<string, { metadata: any; ts: number }>();
const groupMetaCache = new Map<string, { metadata: any; ts: number }>();
export const lidCache = new BoundedMap<string, string>(8000, 24 * 60 * 60_000);
const META_TTL = 300_000;

const gcMeta = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of groupMetaCache) {
        if (now - val.ts > META_TTL) groupMetaCache.delete(key);
    }
    for (const [key, val] of rawGroupMetaCache) {
        if (now - val.ts > META_TTL) rawGroupMetaCache.delete(key);
    }
}, 10 * 60 * 1000);
gcMeta.unref();

export function getRawCachedMeta(groupJid: string): any {
    const c = rawGroupMetaCache.get(groupJid);
    if (!c || Date.now() - c.ts > META_TTL) return undefined;
    return c.metadata;
}

export function setRawCachedMeta(groupJid: string, metadata: any): void {
    if (!groupJid || !metadata) return;
    rawGroupMetaCache.set(groupJid, { metadata, ts: Date.now() });
}

export function getCachedMeta(groupJid: string): any {
    const c = groupMetaCache.get(groupJid);
    if (!c || Date.now() - c.ts > META_TTL) return null;
    return c.metadata;
}

export function setCachedMeta(groupJid: string, metadata: any): void {
    if (!groupJid || !metadata) return;
    groupMetaCache.set(groupJid, { metadata, ts: Date.now() });
}

export function deleteCachedMeta(groupJid: string): void {
    groupMetaCache.delete(groupJid);
    rawGroupMetaCache.delete(groupJid);
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
    if (s.endsWith('@g.us') || s.endsWith('@newsletter') || s.endsWith('@broadcast')) return s;
    if (/:\d+@/i.test(s)) {
        const decoded = jidDecode(s);
        if (decoded?.user && decoded?.server) return `${decoded.user}@${decoded.server}`;
    }
    if (s.endsWith('@lid') || s.endsWith('@s.whatsapp.net')) return s;
    const digits = s.replace(/\D/g, '');
    if (digits && digits.length >= 4 && digits.length <= 15) return `${digits}@s.whatsapp.net`;
    return s;
}

/** Normaliza el JID principal del bot sin duplicar `@s.whatsapp.net`. */
export function normalizeBotJid(sockOrId: any): string {
    const raw =
        typeof sockOrId === 'string'
            ? sockOrId
            : sockOrId?.user?.id || sockOrId?.authState?.creds?.me?.id || '';
    const num = String(raw || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    return num ? `${num}@s.whatsapp.net` : '';
}

/** Normaliza el LID del bot si está disponible en Baileys v7. */
export function normalizeBotLid(sock: any): string {
    const raw = sock?.user?.lid || sock?.authState?.creds?.me?.lid || '';
    const num = String(raw || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    return num ? `${num}@lid` : '';
}

/** Registra un par LID <-> PN en la caché en memoria. */
export function rememberLidMapping(lidRaw: any, pnRaw: any): void {
    const lid = normalizeJid(lidRaw);
    const pn = normalizeJid(pnRaw);
    if (lid?.endsWith('@lid') && pn?.endsWith('@s.whatsapp.net')) {
        lidCache.set(lid, pn);
    }
}

/** Registra pares LID <-> PN desde las propiedades `*Alt` de Baileys v7. */
export function rememberKeyAlts(key: any): void {
    if (!key || typeof key !== 'object') return;
    if (key.remoteJid && key.remoteJidAlt) {
        if (String(key.remoteJid).endsWith('@lid')) rememberLidMapping(key.remoteJid, key.remoteJidAlt);
        else if (String(key.remoteJidAlt).endsWith('@lid')) rememberLidMapping(key.remoteJidAlt, key.remoteJid);
    }
    if (key.participant && key.participantAlt) {
        if (String(key.participant).endsWith('@lid')) rememberLidMapping(key.participant, key.participantAlt);
        else if (String(key.participantAlt).endsWith('@lid')) rememberLidMapping(key.participantAlt, key.participant);
    }
}

function lookupLidFromSession(lidNumber: string, sock?: any): string | null {
    if (!lidNumber) return null;
    const botLid = normalizeBotLid(sock);
    const botJid = normalizeBotJid(sock);
    if (botLid && botJid && botLid.split('@')[0] === lidNumber) {
        return botJid;
    }
    if (sock?.signalRepository?.lidMapping) {
        try {
            const cachedPn = sock.signalRepository.lidMapping.mappingCache?.get(`lid:${lidNumber}`);
            if (cachedPn) {
                const digits = String(cachedPn).split('@')[0].split(':')[0].replace(/\D/g, '');
                if (digits) return `${digits}@s.whatsapp.net`;
            }
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
            const digits = String(phoneStr || '').split('@')[0].split(':')[0].replace(/\D/g, '');
            if (digits) return `${digits}@s.whatsapp.net`;
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
    const rawLid =
        normalizeJid(p.lid) ||
        (String(p.id || '').endsWith('@lid') ? normalizeJid(p.id) : null) ||
        (String(p.jid || '').endsWith('@lid') ? normalizeJid(p.jid) : null);
    if (rawLid) return resolveJidSync(rawLid, sock);
    return null;
}

export function normalizeGroupMetadata(rawMeta: any, sock?: any): any {
    if (!rawMeta || !Array.isArray(rawMeta.participants)) return rawMeta;
    const participants = rawMeta.participants
        .map((p: any) => {
            if (!p) return null;
            const rawId = p.id;
            const realJid = resolveParticipantJid(p, sock) || normalizeJid(p.id) || p.id;
            const originalLid =
                normalizeJid(p.lid) ||
                (String(p.id || '').endsWith('@lid') ? normalizeJid(p.id) : undefined) ||
                (String(p.jid || '').endsWith('@lid') ? normalizeJid(p.jid) : undefined);
            if (originalLid && realJid && !String(realJid).endsWith('@lid')) {
                lidCache.set(originalLid, realJid);
            }
            return {
                ...p,
                id: realJid,
                rawId,
                ...(originalLid ? { lid: originalLid } : {}),
                ...(p.phoneNumber ? { phoneNumber: p.phoneNumber } : {})
            };
        })
        .filter((p: any) => p?.id);
    const ownerNorm = rawMeta.owner ? resolveJidSync(rawMeta.owner, sock) || rawMeta.owner : rawMeta.owner;
    const ownerPn = rawMeta.ownerPn ? normalizeJid(rawMeta.ownerPn) : null;
    if (rawMeta.owner && ownerPn) rememberLidMapping(rawMeta.owner, ownerPn);
    return {
        ...rawMeta,
        owner: ownerPn || ownerNorm,
        participants
    };
}

export async function resolveJidAsync(raw: any, sock: any, groupJid?: string | null, altRaw?: any): Promise<string> {
    if (altRaw) {
        const altNorm = normalizeJid(altRaw);
        const rawNorm = normalizeJid(raw);
        if (rawNorm?.endsWith('@lid') && altNorm?.endsWith('@s.whatsapp.net')) {
            lidCache.set(rawNorm, altNorm);
            return altNorm;
        }
    }
    if (!raw) return '';
    const norm = normalizeJid(raw);
    if (!norm) return '';
    if (!norm.endsWith('@lid')) return norm;

    const sync = resolveJidSync(norm, sock);
    if (sync && !sync.endsWith('@lid')) return sync;

    // Consultar LIDMappingStore nativo de Baileys v7 (asíncrono).
    const lidStore = sock?.signalRepository?.lidMapping;
    if (typeof lidStore?.getPNForLID === 'function') {
        try {
            const pn = await lidStore.getPNForLID(norm);
            const pnNorm = normalizeJid(pn);
            if (pnNorm && pnNorm.endsWith('@s.whatsapp.net')) {
                lidCache.set(norm, pnNorm);
                return pnNorm;
            }
        } catch {}
    }

    if (!groupJid?.endsWith('@g.us')) return norm;
    const lidBase = norm.split('@')[0];
    let meta = getCachedMeta(groupJid);
    if (!meta && typeof sock?.groupMetadata === 'function') {
        try {
            meta = await sock.groupMetadata(groupJid);
        } catch {
            return norm;
        }
    }
    for (const p of meta?.participants ?? []) {
        const pLidBase = String(p.lid || '').split('@')[0].split(':')[0];
        const pRawBase = String(p.rawId || '').split('@')[0].split(':')[0];
        if (pLidBase !== lidBase && pRawBase !== lidBase) continue;
        const phone = p.phoneNumber
            ? normalizeJid(p.phoneNumber)
            : p.id && !String(p.id).endsWith('@lid')
                ? normalizeJid(p.id)
                : null;
        if (phone && !phone.endsWith('@lid')) {
            lidCache.set(norm, phone);
            return phone;
        }
    }
    return norm;
}

export function patchGroupMetadata(sock: any): void {
    if (!sock || sock.groupMetadataPatched || typeof sock.groupMetadata !== 'function') return;
    sock.groupMetadataPatched = true;
    const origMeta = sock.groupMetadata.bind(sock);
    sock.rawGroupMetadata = origMeta;

    sock.groupMetadata = async (jid: string) => {
        try {
            const cached = getCachedMeta(jid);
            if (cached) return cached;
            const rawMeta = await origMeta(jid);
            if (!rawMeta?.participants) return rawMeta;
            // Guardar copia INTACTA para Baileys (relayMessage / sender-key LID)
            // y devolver copia normalizada para comandos.
            setRawCachedMeta(jid, rawMeta);
            const normalized = normalizeGroupMetadata(rawMeta, sock);
            setCachedMeta(jid, normalized);
            return normalized;
        } catch {
            return null;
        }
    };

    // En grupos LID de Baileys v7, `groupParticipantsUpdate` puede requerir el JID
    // real del participante en el grupo (`rawId` / `@lid`) cuando se pasa un `@s.whatsapp.net`.
    if (typeof sock.groupParticipantsUpdate === 'function' && !sock.groupParticipantsUpdatePatched) {
        sock.groupParticipantsUpdatePatched = true;
        const origUpdate = sock.groupParticipantsUpdate.bind(sock);
        sock.groupParticipantsUpdate = async (jid: string, participants: string[], action: string) => {
            const list = Array.isArray(participants) ? participants : [participants];
            let mapped = list;
            if (action !== 'add' && jid?.endsWith('@g.us')) {
                const meta = getCachedMeta(jid) || (await sock.groupMetadata(jid).catch(() => null));
                if (meta?.addressingMode === 'lid' && Array.isArray(meta.participants)) {
                    mapped = list.map(target => {
                        const targetNum = String(target || '').split('@')[0].split(':')[0];
                        const found = meta.participants.find((p: any) => {
                            const idNum = String(p.id || '').split('@')[0].split(':')[0];
                            const pnNum = String(p.phoneNumber || '').split('@')[0].split(':')[0];
                            const lidNum = String(p.lid || '').split('@')[0].split(':')[0];
                            const rawNum = String(p.rawId || '').split('@')[0].split(':')[0];
                            return targetNum && (targetNum === idNum || targetNum === pnNum || targetNum === lidNum || targetNum === rawNum);
                        });
                        return found?.rawId || found?.lid || target;
                    });
                }
            }
            try {
                const res = await origUpdate(jid, mapped, action);
                deleteCachedMeta(jid);
                return res;
            } catch (err) {
                if (mapped.some((v, i) => v !== list[i])) {
                    const res = await origUpdate(jid, list, action);
                    deleteCachedMeta(jid);
                    return res;
                }
                throw err;
            }
        };
    }
}

export async function getBuffer(url: string, options: any = {}): Promise<Buffer> {
    const res = await axios({
        method: 'get',
        url,
        headers: {
            'User-Agent': DEFAULT_UA,
            Accept: '*/*',
            DNT: 1,
            ...(options.headers || {})
        },
        responseType: 'arraybuffer',
        timeout: 30_000,
        maxRedirects: 5,
        ...options
    });
    return Buffer.from(res.data);
}

/** Sube un Buffer de imagen/video/audio a múltiples servicios con respaldo automático. */
export async function uploadMedia(
    buffer: Buffer,
    preferredHost?: string
): Promise<{ url: string; server: string }> {
    const ft = (await fileTypeFromBuffer(buffer).catch(() => null)) || {
        ext: 'bin',
        mime: 'application/octet-stream'
    };
    const filename = `denji_${Date.now()}.${ft.ext}`;
    const makeBlob = () => new Blob([new Uint8Array(buffer)], { type: ft.mime });

    const providers: Record<string, () => Promise<string | null>> = {
        catbox: async () => {
            const form = new FormData();
            form.append('reqtype', 'fileupload');
            form.append('fileToUpload', makeBlob(), filename);
            const res = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                headers: { 'User-Agent': DEFAULT_UA },
                body: form,
                signal: AbortSignal.timeout(25_000)
            });
            const txt = (await res.text()).trim();
            return /^https?:\/\/files\.catbox\.moe\//i.test(txt) ? txt : null;
        },
        quax: async () => {
            const form = new FormData();
            form.append('files[]', makeBlob(), filename);
            const res = await fetch('https://qu.ax/upload.php', {
                method: 'POST',
                headers: { 'User-Agent': DEFAULT_UA },
                body: form,
                signal: AbortSignal.timeout(25_000)
            });
            const json: any = await res.json();
            const url = json?.files?.[0]?.url;
            return typeof url === 'string' && url.startsWith('http') ? url : null;
        },
        uguu: async () => {
            const form = new FormData();
            form.append('files[]', makeBlob(), filename);
            const res = await fetch('https://uguu.se/upload.php', {
                method: 'POST',
                headers: { 'User-Agent': DEFAULT_UA },
                body: form,
                signal: AbortSignal.timeout(25_000)
            });
            const json: any = await res.json();
            const url = json?.files?.[0]?.url;
            return typeof url === 'string' && url.startsWith('http') ? url.replace(/\\\//g, '/') : null;
        },
        tmpfiles: async () => {
            const form = new FormData();
            form.append('file', makeBlob(), filename);
            const res = await fetch('https://tmpfiles.org/api/v1/upload', {
                method: 'POST',
                headers: { 'User-Agent': DEFAULT_UA },
                body: form,
                signal: AbortSignal.timeout(25_000)
            });
            const json: any = await res.json();
            const rawUrl: string | undefined = json?.data?.url;
            if (!rawUrl || !rawUrl.startsWith('http')) return null;
            return rawUrl.replace('://tmpfiles.org/', '://tmpfiles.org/dl/');
        },
        pixeldrain: async () => {
            const res = await fetch(`https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`, {
                method: 'PUT',
                headers: { 'User-Agent': DEFAULT_UA, 'Content-Type': ft.mime },
                body: new Uint8Array(buffer),
                signal: AbortSignal.timeout(25_000)
            });
            const json: any = await res.json();
            return json?.id ? `https://pixeldrain.com/api/file/${json.id}` : null;
        }
    };

    const labels: Record<string, string> = {
        catbox: 'Catbox',
        quax: 'Qu.ax',
        uguu: 'Uguu',
        tmpfiles: 'TmpFiles',
        pixeldrain: 'Pixeldrain'
    };

    const key = String(preferredHost || '').toLowerCase().replace(/[^a-z]/g, '');
    if (key && providers[key]) {
        const url = await providers[key]().catch(() => null);
        if (url) return { url, server: labels[key] || key };
    }

    for (const name of ['catbox', 'quax', 'uguu', 'tmpfiles', 'pixeldrain']) {
        if (name === key) continue;
        try {
            const url = await providers[name]();
            if (url) return { url, server: labels[name] || name };
        } catch {}
    }
    throw new Error('No se pudo subir el archivo a ningún servidor temporal.');
}

async function resolveInputBuffer(input: any): Promise<Buffer> {
    if (Buffer.isBuffer(input)) return input;
    if (input instanceof Uint8Array) return Buffer.from(input);
    if (typeof input === 'string') {
        if (/^data:.*?\/.*?;base64,/i.test(input)) {
            return Buffer.from(input.split(',')[1], 'base64');
        }
        if (/^https?:\/\//i.test(input)) return getBuffer(input);
        if (fs.existsSync(input)) return fs.readFileSync(input);
    }
    if (input && typeof input === 'object' && typeof input.url === 'string') {
        if (/^https?:\/\//i.test(input.url)) return getBuffer(input.url);
        if (fs.existsSync(input.url)) return fs.readFileSync(input.url);
    }
    throw new Error('Imagen inválida.');
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

export function unwrapContent(message: any): any {
    if (!message || typeof message !== 'object') return message;
    let raw = message;
    for (let i = 0; i < 6; i++) {
        if (raw?.ephemeralMessage?.message) { raw = raw.ephemeralMessage.message; continue; }
        if (raw?.viewOnceMessage?.message) { raw = raw.viewOnceMessage.message; continue; }
        if (raw?.viewOnceMessageV2?.message) { raw = raw.viewOnceMessageV2.message; continue; }
        if (raw?.viewOnceMessageV2Extension?.message) { raw = raw.viewOnceMessageV2Extension.message; continue; }
        if (raw?.documentWithCaptionMessage?.message) { raw = raw.documentWithCaptionMessage.message; continue; }
        if (raw?.editedMessage?.message?.protocolMessage?.editedMessage) {
            raw = raw.editedMessage.message.protocolMessage.editedMessage;
            continue;
        }
        if (raw?.editedMessage?.message) { raw = raw.editedMessage.message; continue; }
        if (raw?.protocolMessage?.editedMessage) { raw = raw.protocolMessage.editedMessage; continue; }
        break;
    }
    return raw;
}

async function renderThumb(webpBuf: Buffer, size: number, format: 'png' | 'jpg'): Promise<Buffer> {
    const tag = crypto.randomBytes(6).toString('hex');
    const inFile = path.join(os.tmpdir(), `denji-pk-in-${tag}.webp`);
    const outFile = path.join(os.tmpdir(), `denji-pk-out-${tag}.${format}`);
    await fs.promises.writeFile(inFile, webpBuf);
    try {
        const vf =
            format === 'png'
                ? `scale=${size}:${size}:force_original_aspect_ratio=decrease,format=rgba,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#00000000`
                : `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=white`;
        await runFfmpeg(['-y', '-i', inFile, '-frames:v', '1', '-vf', vf, outFile]);
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

export function attachSockHelpers(sock: any): void {
    if (!sock) return;

    if (!sock.decodeJid) {
        sock.decodeJid = decodeJid;
    }

    if (!sock.getBotJid) {
        sock.getBotJid = () => normalizeBotJid(sock);
    }

    patchGroupMetadata(sock);

    // Reemplaza `updateProfilePicture` de Baileys (que requiere `jimp` o `sharp`)
    // con redimensionado vía `ffmpeg`, compatible con Termux sin dependencias extra.
    if (typeof sock.query === 'function' && !sock.profilePicPatched) {
        sock.profilePicPatched = true;
        sock.updateProfilePicture = async (jid: string, content: any, opts?: { full?: boolean; width?: number }) => {
            if (!jid) throw new Error('JID inválido para foto de perfil.');
            const rawBuf = await resolveInputBuffer(content);
            const size = opts?.width || 720;
            const img = await resizeToJpeg(rawBuf, size, !opts?.full);
            const meJid = normalizeBotJid(sock);
            const normTarget = jid.endsWith('@g.us') || jid.endsWith('@newsletter') ? jid : jidNormalizedUser(jid);
            const targetJid = meJid && normTarget === meJid ? undefined : normTarget;
            await sock.query({
                tag: 'iq',
                attrs: {
                    to: S_WHATSAPP_NET,
                    type: 'set',
                    xmlns: 'w:profile:picture',
                    ...(targetJid ? { target: targetJid } : {})
                },
                content: [
                    {
                        tag: 'picture',
                        attrs: { type: 'image' },
                        content: img
                    }
                ]
            });
        };
    }

    if (!sock.downloadMediaMessage) {
        sock.downloadMediaMessage = async (message: any): Promise<Buffer> => {
            const m = message?.msg || message;
            const mime = m?.mimetype || message?.mimetype || message?.mime || '';
            let messageType = String(message?.type || message?.mtype || mime.split('/')[0] || '')
                .replace(/Message$/i, '')
                .toLowerCase();
            if (messageType === 'ptv') messageType = 'video';
            if (mime === 'image/webp' && !messageType) messageType = 'sticker';
            if (!messageType) messageType = 'document';
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
            const buff = await resolveInputBuffer(p);
            const { packname, author, categories, ...sendOpts } = options || {};
            if (packname || author) {
                const filePath = await writeExifImg(buff, { packname, author, categories });
                try {
                    const stickerBuf = fs.readFileSync(filePath);
                    await sock.sendMessage(jid, { sticker: stickerBuf, ...sendOpts }, { quoted });
                    return stickerBuf;
                } finally {
                    if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
                }
            }
            const webpBuf = await imageToWebp(buff);
            await sock.sendMessage(jid, { sticker: webpBuf, ...sendOpts }, { quoted });
            return webpBuf;
        };
    }

    if (!sock.sendVideoAsSticker) {
        sock.sendVideoAsSticker = async (jid: string, p: any, quoted?: any, options: any = {}) => {
            const buff = await resolveInputBuffer(p);
            const { packname, author, categories, ...sendOpts } = options || {};
            if (packname || author) {
                const filePath = await writeExifVid(buff, { packname, author, categories });
                try {
                    const stickerBuf = fs.readFileSync(filePath);
                    await sock.sendMessage(jid, { sticker: stickerBuf, ...sendOpts }, { quoted });
                    return stickerBuf;
                } finally {
                    if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
                }
            }
            const webpBuf = await videoToWebp(buff);
            await sock.sendMessage(jid, { sticker: webpBuf, ...sendOpts }, { quoted });
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
            const buffer = await resolveInputBuffer(p);
            const type = (await fileTypeFromBuffer(buffer)) ?? { mime: 'application/octet-stream', ext: 'bin' };
            const mimetype = options.mimetype ?? type.mime;
            let mtype = 'document';
            if (/webp/i.test(type.mime) && !options.asImage) mtype = 'sticker';
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
            if (!Array.isArray(medias) || medias.length === 0) {
                throw new Error('No se encontraron elementos multimedia para enviar.');
            }
            const quoted = options.quoted;
            // Si solo hay 1 elemento, enviarlo directamente en vez de fallar.
            if (medias.length === 1) {
                const { type, data, caption } = medias[0];
                return sock.sendMessage(
                    jid,
                    { [type || 'image']: data, ...(caption ? { caption } : {}) },
                    { quoted }
                );
            }
            const delayMs = !isNaN(options.delay) ? Number(options.delay) : 500;
            try {
                // Formato nativo de álbum de Baileys v7 (album + albumParentKey + messageSecret).
                const opener = await sock.sendMessage(
                    jid,
                    {
                        album: {
                            expectedImageCount: medias.filter(m => (m.type || 'image') === 'image').length,
                            expectedVideoCount: medias.filter(m => m.type === 'video').length
                        }
                    },
                    { quoted }
                );
                if (!opener?.key) throw new Error('No se pudo crear el mensaje de álbum');
                for (const { type, data, caption } of medias) {
                    await sock.sendMessage(jid, {
                        [type || 'image']: data,
                        ...(caption ? { caption } : {}),
                        albumParentKey: opener.key
                    });
                    await delay(delayMs);
                }
                return opener;
            } catch {
                let last: any = null;
                for (const { type, data, caption } of medias.slice(0, 5)) {
                    last = await sock.sendMessage(
                        jid,
                        { [type || 'image']: data, ...(caption ? { caption } : {}) },
                        { quoted }
                    );
                    await delay(delayMs);
                }
                return last;
            }
        };
    }

    if (!sock.sendCodeMessage) {
        // WhatsApp descarta silenciosamente `botForwardedMessage` (@bot) en cuentas normales;
        // enviar como bloque de código formateado garantiza entrega en grupos y chats privados.
        sock.sendCodeMessage = async (jid: string, title: string, code: any, quoted?: any, tableData?: any) => {
            const parts: string[] = [];
            if (title && String(title).trim()) parts.push(String(title).trim());
            if (tableData?.headers?.length && Array.isArray(tableData.rows)) {
                if (tableData.title) parts.push(`*${tableData.title}*`);
                for (const row of tableData.rows) {
                    if (Array.isArray(row) && row.length >= 2) {
                        parts.push(`> *${row[0]}:* ${row.slice(1).join(' · ')}`);
                    }
                }
            }
            const codeText = String(code ?? '').trim();
            if (codeText) {
                const maxLen = 60_000;
                const clipped =
                    codeText.length > maxLen
                        ? `${codeText.slice(0, maxLen)}\n... [truncado]`
                        : codeText;
                parts.push(`\`\`\`\n${clipped}\n\`\`\``);
            }
            return sock.sendMessage(jid, { text: parts.join('\n\n') }, { quoted });
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
                : sock.sendMessage(jid, { ...options, text: String(text ?? '') }, { quoted, ...options });
    }

    if (!sock.sendText) {
        sock.sendText = (jid: string, text: string, quoted: any = '', options: any = {}) =>
            sock.sendMessage(jid, { text, ...options }, { quoted });
    }
}

function toMediaCategory(type: string, mime: string): string {
    const t = String(type || '').replace(/Message$/i, '').toLowerCase();
    if (['image', 'video', 'sticker', 'audio', 'document'].includes(t)) return t;
    if (t === 'ptv') return 'video';
    if (/webp/i.test(mime)) return 'sticker';
    if (/^image\//i.test(mime)) return 'image';
    if (/^video\//i.test(mime)) return 'video';
    if (/^audio\//i.test(mime)) return 'audio';
    return '';
}

export async function smsg(sock: any, msg: any): Promise<any> {
    if (!msg) return msg;
    attachSockHelpers(sock);

    const botId = normalizeBotJid(sock);
    const botLid = normalizeBotLid(sock);
    if (botLid && botId) rememberLidMapping(botLid, botId);
    const botSetting = botId ? db.getSettings(botId) : { prefix: ['.'] };

    if (msg.key) {
        rememberKeyAlts(msg.key);
        msg.id = msg.key.id || '';
        msg.chat = msg.key.remoteJid || '';
        msg.fromMe = Boolean(msg.key.fromMe);
        msg.isBot =
            ['HSK', 'BAE', 'B1E', '3EB0', 'B24E', 'WA'].some(
                a => msg.id.startsWith(a) && [12, 16, 20, 22, 40].includes(msg.id.length)
            ) || false;
        msg.isGroup = msg.chat.endsWith('@g.us');

        if (!msg.isGroup && msg.chat.endsWith('@lid')) {
            const resolvedChat = await resolveJidAsync(msg.chat, sock, null, msg.key.remoteJidAlt);
            if (resolvedChat && !resolvedChat.endsWith('@lid')) msg.chat = resolvedChat;
        }
        msg.from = msg.chat;

        if (msg.fromMe && botId) {
            msg.sender = botId;
        } else {
            const rawSender = msg.key.participant || msg.key.remoteJid || '';
            const altSender = msg.isGroup ? msg.key.participantAlt : msg.key.remoteJidAlt;
            const decoded = decodeJid(rawSender);
            if (
                (botId && decoded && areJidsSameUser(decoded, botId)) ||
                (botLid && decoded && areJidsSameUser(decoded, botLid))
            ) {
                msg.sender = botId || decoded;
                msg.fromMe = true;
            } else {
                msg.sender = await resolveJidAsync(decoded, sock, msg.key.remoteJid, altSender);
            }
        }
    }

    if (msg.message) {
        const unwrapped = unwrapContent(msg.message);
        msg.type = getContentType(unwrapped) || Object.keys(unwrapped || {})[0] || '';
        msg.mtype = msg.type;
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
        const resolveMentionOne = async (raw: string): Promise<string | null> => {
            if (!raw) return null;
            const resolved = await resolveJidAsync(raw, sock, msg.isGroup ? msg.chat : null);
            return resolved || null;
        };
        msg.mentionedJid = rawMentioned.length
            ? (await Promise.all(rawMentioned.map(resolveMentionOne))).filter(Boolean)
            : [];

        let activePrefixes: string[] = [];
        if (botSetting.prefix === 1) activePrefixes = [];
        else if (Array.isArray(botSetting.prefix)) activePrefixes = botSetting.prefix;
        else if (typeof botSetting.prefix === 'string') activePrefixes = splitGraphemes(botSetting.prefix);
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

        const directMime =
            msg.msg?.mimetype ||
            (msg.type === 'stickerMessage' ? 'image/webp' : '') ||
            (msg.type === 'imageMessage' ? 'image/jpeg' : '') ||
            (msg.type === 'videoMessage' || msg.type === 'ptvMessage' ? 'video/mp4' : '') ||
            (msg.type === 'audioMessage' ? 'audio/ogg; codecs=opus' : '');
        msg.mimetype = directMime;
        msg.mime = directMime;
        msg.mediaType = toMediaCategory(msg.type, directMime);
        msg.isMedia = Boolean(directMime || msg.msg?.thumbnailDirectPath);
        if (msg.isMedia) {
            msg.size = msg.msg?.fileLength;
            msg.height = msg.msg?.height || '';
            msg.width = msg.msg?.width || '';
            msg.seconds = msg.msg?.seconds || 0;
            if (/webp/i.test(directMime)) msg.isAnimated = Boolean(msg.msg?.isAnimated);
        }

        const ctxInfo = msg.msg?.contextInfo;
        msg.quoted = ctxInfo?.quotedMessage ? {} : null;
        if (msg.quoted) {
            // Preservar `rawMessage` sin desenvolver para `.read` (ver única vez)
            msg.quoted.rawMessage = ctxInfo.quotedMessage;
            const rawQuoted = unwrapContent(ctxInfo.quotedMessage);
            msg.quoted.message = rawQuoted || extractMessageContent(ctxInfo.quotedMessage) || ctxInfo.quotedMessage;
            msg.quoted.type = getContentType(msg.quoted.message) || Object.keys(msg.quoted.message || {})[0] || '';
            msg.quoted.mtype = msg.quoted.type;
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
            const rawQP = decodeJid(ctxInfo.participant ?? '');
            msg.quoted.rawParticipant = ctxInfo.participant || '';
            msg.quoted.sender = await resolveJidAsync(rawQP, sock, msg.chat);
            msg.quoted.fromMe = Boolean(
                (botId && (areJidsSameUser(msg.quoted.sender, botId) || (rawQP && areJidsSameUser(rawQP, botId)))) ||
                    (botLid && (areJidsSameUser(msg.quoted.sender, botLid) || (rawQP && areJidsSameUser(rawQP, botLid))))
            );
            if (msg.quoted.fromMe && botId) msg.quoted.sender = botId;
            msg.quoted.text =
                msg.quoted.msg?.text ||
                msg.quoted.msg?.caption ||
                msg.quoted.message?.conversation ||
                msg.quoted.msg?.conversation ||
                msg.quoted.msg?.contentText ||
                msg.quoted.msg?.selectedDisplayText ||
                msg.quoted.msg?.title ||
                '';
            msg.quoted.caption = msg.quoted.msg?.caption || '';
            msg.quoted.body =
                msg.quoted.text ||
                msg.quoted.msg?.selectedButtonId ||
                msg.quoted.msg?.singleSelectReply?.selectedRowId ||
                msg.quoted.msg?.selectedId ||
                msg.quoted.msg?.name ||
                '';
            const rawQMentioned: string[] = msg.quoted.msg?.contextInfo?.mentionedJid ?? [];
            msg.quoted.mentionedJid = rawQMentioned.length
                ? (await Promise.all(rawQMentioned.map(resolveMentionOne))).filter(Boolean)
                : [];
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

            const qMime =
                msg.quoted.msg?.mimetype ||
                (msg.quoted.type === 'stickerMessage' ? 'image/webp' : '') ||
                (msg.quoted.type === 'imageMessage' ? 'image/jpeg' : '') ||
                (msg.quoted.type === 'videoMessage' || msg.quoted.type === 'ptvMessage' ? 'video/mp4' : '') ||
                (msg.quoted.type === 'audioMessage' ? 'audio/ogg; codecs=opus' : '');
            msg.quoted.mimetype = qMime;
            msg.quoted.mime = qMime;
            msg.quoted.mediaType = toMediaCategory(msg.quoted.type, qMime);
            msg.quoted.isMedia = Boolean(qMime || msg.quoted.msg?.thumbnailDirectPath);
            if (msg.quoted.isMedia) {
                msg.quoted.size = msg.quoted.msg?.fileLength;
                msg.quoted.height = msg.quoted.msg?.height || '';
                msg.quoted.width = msg.quoted.msg?.width || '';
                msg.quoted.seconds = msg.quoted.msg?.seconds || 0;
                if (/webp/i.test(qMime)) msg.quoted.isAnimated = Boolean(msg.quoted.msg?.isAnimated);
            }
            const delParticipant = ctxInfo.participant || msg.quoted.sender;
            msg.quoted.key = {
                remoteJid: ctxInfo.remoteJid || msg.chat,
                participant: delParticipant,
                fromMe: msg.quoted.fromMe,
                id: ctxInfo.stanzaId
            };
            msg.quoted.fakeObj = proto.WebMessageInfo.fromObject({
                key: { remoteJid: msg.quoted.chat, fromMe: msg.quoted.fromMe, id: msg.quoted.id },
                message: msg.quoted.message,
                ...(msg.isGroup ? { participant: delParticipant } : {})
            });
            msg.quoted.download = () => sock.downloadMediaMessage(msg.quoted);
            msg.quoted.delete = () =>
                sock.sendMessage(msg.quoted.chat, {
                    delete: {
                        remoteJid: msg.quoted.chat,
                        fromMe: msg.quoted.fromMe,
                        id: msg.quoted.id,
                        participant: delParticipant
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
        if (content && typeof content === 'object' && !Buffer.isBuffer(content)) {
            return sock.sendMessage(chat, content, { ...options, quoted, ephemeralExpiration });
        }
        if (Buffer.isBuffer(content)) {
            return sock.sendFile(chat, content, 'file', '', quoted, false, options);
        }
        return sock.sendMessage(chat, { text: String(content ?? ''), ...options }, { quoted, ephemeralExpiration });
    };

    return msg;
}

export function serialize(sock: any, m: proto.IWebMessageInfo): any {
    if (!m || typeof m !== 'object' || !m.message) return null;
    const key: any = m.key || {};
    rememberKeyAlts(key);
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
    const rawChat = decodeJid(key.remoteJid || '');
    const chat =
        rawChat.endsWith('@lid') && key.remoteJidAlt
            ? decodeJid(key.remoteJidAlt)
            : UserJid(sock, rawChat);
    const rawSender = decodeJid(key.participant || key.participantAlt || key.remoteJid || '');
    const sender =
        rawSender.endsWith('@lid') && key.participantAlt
            ? decodeJid(key.participantAlt)
            : UserJid(sock, chat, rawSender);
    return {
        ...m,
        type: msgType,
        mtype: msgType,
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

(globalThis as any).normalizeBotJid = normalizeBotJid;
