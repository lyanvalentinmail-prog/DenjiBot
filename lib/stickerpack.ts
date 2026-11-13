import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import webp from 'node-webpmux';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import config from '#config';
import { sendStickerPack } from './packmessage.ts';
import type { PackInput } from './packmessage.ts';

/*
 * Packs de stickers (.spack / .done / .cancel).
 *
 * `.spack` abre un pack para quien lo envía en ese chat. Mientras está abierto,
 * cada foto o sticker que mande esa persona se convierte y se agrega. `.done`
 * lo cierra y envía el paquete; `.cancel` lo descarta.
 */

export const MAX_STICKERS = 60;
const SESSION_TTL_MS = 15 * 60_000;
const FINISHED_TTL_MS = 10 * 60_000;
const RECENT_TTL_MS = 60_000;
const RECENT_WINDOW_MS = 10_000;
const STATUS_DELAY_MS = 2500;
const STATIC_LIMIT = 100 * 1024;
const ANIMATED_LIMIT = 500 * 1024;
const LOOSE_DELAY_MS = 400;
const HD_DUAL_UPLOAD = 10;

type MediaKind = 'image' | 'sticker';

type MediaRef = {
    id: string;
    kind: MediaKind;
    node: any;
    album: string;
    raw: any;
};

type PackItem = {
    hash: string;
    webp: Buffer;
    animated: boolean;
};

type PackSession = {
    key: string;
    chat: string;
    sock: any;
    name: string;
    author: string;
    prefix: string;
    items: PackItem[];
    seen: Set<string>;
    pending: number;
    chain: Promise<void>;
    reported: number;
    failed: number;
    duplicated: number;
    overflow: number;
    noFfmpeg: boolean;
    lastMsg: any;
    statusTimer: NodeJS.Timeout | null;
    expireTimer: NodeJS.Timeout | null;
    closed: boolean;
};

type FinishedPack = {
    name: string;
    author: string;
    items: PackItem[];
    timer: NodeJS.Timeout;
};

const sessions = new Map<string, PackSession>();
const finished = new Map<string, FinishedPack>();
const recent = new Map<string, { ref: MediaRef; ts: number }[]>();

const digits = (jid: string): string => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

/** Un pack pertenece a una persona dentro de un chat. */
export function packKey(msg: any): string {
    const who = msg?.key?.fromMe ? 'me' : digits(msg?.sender) || String(msg?.sender || '');
    return `${msg?.chat}|${who}`;
}

const unwrap = (message: any): any => message?.ephemeralMessage?.message || message;

function albumOf(message: any): { album: string; hdCopy: boolean } {
    const info = message?.messageContextInfo || unwrap(message)?.messageContextInfo;
    const association = info?.messageAssociation;
    const type = association?.associationType;
    return {
        album: association?.parentMessageKey?.id || '',
        // Las fotos en HD llegan dos veces (normal y HD): la copia HD se ignora.
        hdCopy: type === HD_DUAL_UPLOAD || type === 'HD_IMAGE_DUAL_UPLOAD'
    };
}

function mediaRef(raw: any, message: any = raw?.message, id: string = raw?.key?.id): MediaRef | null {
    const inner = unwrap(message);
    const kind: MediaKind | null = inner?.imageMessage ? 'image' : inner?.stickerMessage ? 'sticker' : null;
    if (!kind || !id) return null;

    const { album, hdCopy } = albumOf(message);
    if (hdCopy) return null;

    return { id, kind, node: inner[`${kind}Message`], album, raw };
}

/** Foto enviada sin comando (posible contenido para un pack). */
export function isLoosePhoto(raw: any, prefix: string): boolean {
    const image = unwrap(raw?.message)?.imageMessage;
    return !!image && !String(image.caption || '').trim().startsWith(prefix);
}

// ───────────────────────── conversión ─────────────────────────

const ffmpegBin = (): string => process.env.FFMPEG_PATH || 'ffmpeg';

const tmpFile = (ext: string): string =>
    path.join(os.tmpdir(), `denji-pack-${crypto.randomBytes(8).toString('hex')}.${ext}`);

function ffmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        execFile(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 60_000 }, (error, _out, stderr) => {
            if (!error) return resolve();
            const missing = (error as any).code === 'ENOENT';
            reject(new Error(missing ? 'ffmpeg no está instalado' : String(stderr || error.message).trim().split('\n').pop()));
        });
    });
}

/** Ejecuta ffmpeg con un archivo de entrada y devuelve el archivo de salida. */
async function transcode(input: Buffer, inExt: string, outExt: string, args: (input: string) => string[]): Promise<Buffer> {
    const source = tmpFile(inExt);
    const target = tmpFile(outExt);
    await fs.promises.writeFile(source, input);
    try {
        await ffmpeg([...args(source), target]);
        return await fs.promises.readFile(target);
    } finally {
        await fs.promises.unlink(source).catch(() => {});
        await fs.promises.unlink(target).catch(() => {});
    }
}

const SQUARE_512 =
    'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,' +
    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';

/** Imagen → sticker WebP de 512x512 con fondo transparente, de 100 KB como máximo. */
export async function imageToSticker(image: Buffer, ext = 'jpg'): Promise<Buffer> {
    let best: Buffer | null = null;

    for (const quality of [80, 60, 40, 25]) {
        const out = await transcode(image, ext, 'webp', source => [
            '-i', source,
            '-vf', SQUARE_512,
            '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(quality), '-compression_level', '6',
            '-pix_fmt', 'yuva420p', '-frames:v', '1', '-an'
        ]);
        if (!best || out.length < best.length) best = out;
        if (out.length <= STATIC_LIMIT) break;
    }

    return best!;
}

async function inspectWebp(data: Buffer): Promise<{ width: number; height: number; animated: boolean }> {
    const image = new webp.Image();
    await image.load(data);
    return { width: image.width, height: image.height, animated: !!image.hasAnim };
}

async function toSticker(ref: MediaRef, data: Buffer): Promise<{ webp: Buffer; animated: boolean }> {
    if (ref.kind === 'image') {
        return { webp: await imageToSticker(data), animated: false };
    }

    if (ref.node?.isLottie || (ref.node?.mimetype && ref.node.mimetype !== 'image/webp')) {
        throw new Error('sticker no compatible');
    }

    const info = await inspectWebp(data);
    if (info.animated) {
        // ffmpeg no puede leer WebP animados: solo se aceptan si ya tienen el formato correcto.
        if (info.width !== 512 || info.height !== 512 || data.length > ANIMATED_LIMIT) {
            throw new Error('sticker animado no compatible');
        }
        return { webp: data, animated: true };
    }

    if (info.width === 512 && info.height === 512 && data.length <= STATIC_LIMIT) {
        return { webp: data, animated: false };
    }
    return { webp: await imageToSticker(data, 'webp'), animated: false };
}

async function download(ref: MediaRef): Promise<Buffer> {
    const stream = await downloadContentFromMessage(ref.node, ref.kind);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const data = Buffer.concat(chunks);
    if (!data.length) throw new Error('archivo vacío');
    return data;
}

/** Datos del pack dentro de cada sticker, para que WhatsApp muestre nombre y autor. */
async function withExif(data: Buffer, name: string, author: string): Promise<Buffer> {
    try {
        const json = Buffer.from(JSON.stringify({
            'sticker-pack-id': 'https://github.com/lyanvalentinmail-prog/DenjiBot',
            'sticker-pack-name': name,
            'sticker-pack-publisher': author,
            emojis: ['🤩']
        }), 'utf8');
        const header = Buffer.from([
            0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
            0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
        ]);
        const exif = Buffer.concat([header, json]);
        exif.writeUIntLE(json.length, 14, 4);

        const image = new webp.Image();
        await image.load(data);
        image.exif = exif;
        return Buffer.from(await image.save(null));
    } catch {
        return data;
    }
}

/** Icono (PNG 96x96) y miniatura (JPEG 252x252) del pack a partir de una imagen. */
async function coverImages(source: Buffer, ext: string): Promise<{ trayPng: Buffer; thumbnailJpeg: Buffer }> {
    const square = (size: number): string =>
        `scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,` +
        `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`;

    const trayPng = await transcode(source, ext, 'png', input => [
        '-i', input, '-vf', square(96), '-frames:v', '1'
    ]);
    const thumbnailJpeg = await transcode(source, ext, 'jpg', input => [
        '-i', input,
        '-filter_complex', `color=white:s=252x252[bg];[0:v]${square(252)}[fg];[bg][fg]overlay=shortest=1`,
        '-frames:v', '1', '-q:v', '4'
    ]);

    return { trayPng, thumbnailJpeg };
}

async function buildPackInput(name: string, author: string, items: PackItem[]): Promise<PackInput> {
    const stickers = [];
    for (const item of items) {
        stickers.push({ webp: await withExif(item.webp, name, author), animated: item.animated });
    }

    const cover = items.find(item => !item.animated);
    let images;
    if (cover) {
        images = await coverImages(cover.webp, 'webp');
    } else if (config.banner && fs.existsSync(config.banner)) {
        images = await coverImages(await fs.promises.readFile(config.banner), 'jpg');
    } else {
        throw new Error('no hay una imagen para el icono del pack');
    }

    return { name, publisher: author, description: `Creado con ${config.botName}`, stickers, ...images };
}

// ───────────────────────── cola de trabajo ─────────────────────────

// Como mucho dos conversiones a la vez entre todos los packs: en un teléfono
// cada una lanza un proceso de ffmpeg.
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
    if (running >= 2) await new Promise<void>(resolve => waiting.push(resolve));
    running++;
    try {
        return await task();
    } finally {
        running--;
        waiting.shift()?.();
    }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// ───────────────────────── sesiones ─────────────────────────

const say = (session: { sock: any; chat: string; lastMsg?: any }, text: string): Promise<any> =>
    session.sock.sendMessage(session.chat, { text }, session.lastMsg ? { quoted: session.lastMsg } : undefined).catch(() => null);

function touch(session: PackSession): void {
    if (session.expireTimer) clearTimeout(session.expireTimer);
    session.expireTimer = setTimeout(() => {
        if (sessions.get(session.key) !== session) return;
        close(session);
        say(session, `ׅ  ׄ  ✿ El pack *${session.name}* se canceló por inactividad.`);
    }, SESSION_TTL_MS);
    session.expireTimer.unref();
}

function close(session: PackSession): void {
    session.closed = true;
    if (session.statusTimer) clearTimeout(session.statusTimer);
    if (session.expireTimer) clearTimeout(session.expireTimer);
    session.statusTimer = session.expireTimer = null;
    if (sessions.get(session.key) === session) sessions.delete(session.key);
}

function forget(key: string): void {
    const old = finished.get(key);
    if (old) clearTimeout(old.timer);
    finished.delete(key);
}

function scheduleStatus(session: PackSession): void {
    if (session.closed) return;
    if (session.statusTimer) clearTimeout(session.statusTimer);
    session.statusTimer = setTimeout(() => {
        session.statusTimer = null;
        // Si aún quedan fotos convirtiéndose, la última en terminar vuelve a programar el aviso.
        if (session.closed || session.pending > 0) return;
        sendStatus(session);
    }, STATUS_DELAY_MS);
    session.statusTimer.unref();
}

function sendStatus(session: PackSession): void {
    const added = session.items.length - session.reported;
    const { failed, duplicated, overflow, prefix: p } = session;
    if (!added && !failed && !duplicated && !overflow) return;

    session.reported = session.items.length;
    session.failed = session.duplicated = session.overflow = 0;

    const lines = [`ׅ  ׄ  ✿ *Sticker pack* » ${session.name}`, ''];
    lines.push(`ׅ  ׄ  ✿ *Cargadas ahora* » ${added}`);
    lines.push(`ׅ  ׄ  ✿ *Total en el pack* » ${session.items.length} de ${MAX_STICKERS}`);
    if (duplicated) lines.push(`ׅ  ׄ  ✿ *Repetidas (omitidas)* » ${duplicated}`);
    if (failed) lines.push(`ׅ  ׄ  ✿ *No se pudieron cargar* » ${failed}`);
    if (overflow) lines.push(`ׅ  ׄ  ✿ *Fuera del límite (omitidas)* » ${overflow}`);
    lines.push('');
    if (failed && session.noFfmpeg) {
        lines.push('> El bot necesita *ffmpeg* para crear stickers (en Termux: pkg install ffmpeg).');
    }

    if (session.items.length) {
        lines.push(`> Si el pack está listo usa *${p}done*`);
        lines.push(`> Para cancelarlo usa *${p}cancel*`);
        if (session.items.length < MAX_STICKERS) lines.push('> Puedes seguir enviando fotos para agregarlas.');
    } else {
        lines.push('> Envía otras fotos para intentarlo de nuevo.');
        lines.push(`> Para cancelarlo usa *${p}cancel*`);
    }

    say(session, lines.join('\n'));
}

function addMedia(session: PackSession, ref: MediaRef): void {
    if (session.closed || session.seen.has(ref.id)) return;
    session.seen.add(ref.id);
    session.lastMsg = ref.raw || session.lastMsg;
    touch(session);

    if (session.items.length + session.pending >= MAX_STICKERS) {
        session.overflow++;
        scheduleStatus(session);
        return;
    }

    session.pending++;
    session.chain = session.chain.then(() => limited(async () => {
        try {
            if (session.closed) return;
            const sticker = await toSticker(ref, await download(ref));
            const hash = crypto.createHash('sha256').update(sticker.webp).digest('hex');
            if (session.items.some(item => item.hash === hash)) {
                session.duplicated++;
            } else {
                session.items.push({ hash, ...sticker });
            }
        } catch (error: any) {
            session.failed++;
            if (/ffmpeg no está instalado/.test(String(error?.message))) session.noFfmpeg = true;
            console.error('[SPACK] No se pudo cargar una imagen:', error?.message || error);
        } finally {
            session.pending--;
            scheduleStatus(session);
        }
    }));
}

function remember(key: string, ref: MediaRef): void {
    const now = Date.now();
    const list = (recent.get(key) || []).filter(entry => now - entry.ts < RECENT_TTL_MS);
    list.push({ ref, ts: now });
    recent.set(key, list.slice(-MAX_STICKERS));
}

setInterval(() => {
    const now = Date.now();
    for (const [key, list] of recent) {
        if (!list.length || now - list[list.length - 1].ts >= RECENT_TTL_MS) recent.delete(key);
    }
}, RECENT_TTL_MS).unref();

/**
 * Se llama con cada mensaje que no es un comando. Si quien lo envía tiene un
 * pack abierto en ese chat, la foto se agrega. Devuelve true en ese caso.
 *
 * Los stickers no se recogen solos (se usan para conversar): para agregar uno
 * hay que responderle con `.spack`.
 */
export function collectPackMedia(sock: any, msg: any): boolean {
    const ref = mediaRef(msg);
    if (!ref || ref.kind !== 'image') return false;

    const key = packKey(msg);
    const session = sessions.get(key);
    if (!session) {
        // Las fotos de un álbum pueden llegar antes que la que trae el `.spack`.
        remember(key, ref);
        return false;
    }

    session.sock = sock;
    addMedia(session, ref);
    return true;
}

const clean = (text: string, max = 64): string => text.replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Texto que sigue al comando (`.spack Nombre | Autor`). Se lee del mensaje
 * original porque el handler quita el separador `|` de los argumentos.
 */
function parseNames(msg: any): { name: string; author: string } {
    const text = String(msg?.body || '').trim().replace(/^\S+\s*/, '');
    const [name = '', author = ''] = text.split(/[|•]/);
    return { name: clean(name), author: clean(author) };
}

const plural = (count: number): string => `*${count}* ${count === 1 ? 'sticker' : 'stickers'}`;

/** `.spack [nombre | autor]`: abre un pack (o sigue con el que ya está abierto). */
export async function startPack(ctx: any): Promise<void> {
    const { sock, msg } = ctx;
    const p = ctx.usedPrefix || ctx.prefix || config.prefix || '.';
    const key = packKey(msg);
    const given = parseNames(msg);

    let session = sessions.get(key);
    const isNew = !session;

    if (!session) {
        forget(key);
        session = {
            key,
            chat: msg.chat,
            sock,
            name: given.name || clean(ctx.user?.sPack || '') || clean(`Pack de ${msg.pushName || 'Usuario'}`),
            author: given.author || clean(ctx.user?.sAuthor || '') || clean(config.botName),
            prefix: p,
            items: [],
            seen: new Set(),
            pending: 0,
            chain: Promise.resolve(),
            reported: 0,
            failed: 0,
            duplicated: 0,
            overflow: 0,
            noFfmpeg: false,
            lastMsg: msg,
            statusTimer: null,
            expireTimer: null,
            closed: false
        };
        sessions.set(key, session);
    } else {
        if (given.name) session.name = given.name;
        if (given.author) session.author = given.author;
    }

    session.sock = sock;
    session.prefix = p;
    session.lastMsg = msg;
    touch(session);

    const before = session.seen.size;

    // 1. La foto o sticker al que responde el comando.
    const context = unwrap(msg.message)?.extendedTextMessage?.contextInfo;
    if (context?.quotedMessage && context.stanzaId) {
        const quoted = mediaRef(null, context.quotedMessage, context.stanzaId);
        if (quoted) addMedia(session, quoted);
    }

    // 2. Las fotos del mismo álbum que llegaron justo antes que el comando.
    const own = mediaRef(msg);
    const now = Date.now();
    for (const entry of recent.get(key) || []) {
        const sameAlbum = !!own?.album && entry.ref.album === own.album;
        if (sameAlbum || now - entry.ts <= RECENT_WINDOW_MS) addMedia(session, entry.ref);
    }
    recent.delete(key);

    // 3. La foto que trae el propio comando.
    if (own) addMedia(session, own);

    // Con fotos, el aviso llega cuando terminan de cargarse.
    if (session.seen.size > before) return;

    if (isNew) {
        await say(session,
            `ׅ  ׄ  ✿ *Sticker pack* » ${session.name}\n\n` +
            `Envía las fotos que quieras convertir en stickers (puedes mandar varias a la vez, hasta ${MAX_STICKERS}).\n\n` +
            `> Cuando el pack esté listo usa *${p}done*\n` +
            `> Para cancelarlo usa *${p}cancel*`);
    } else {
        await say(session,
            `ׅ  ׄ  ✿ *Sticker pack* » ${session.name}\n\n` +
            `Ya tienes este pack abierto con ${plural(session.items.length + session.pending)}. Sigue enviando fotos.\n\n` +
            `> Si el pack está listo usa *${p}done*\n` +
            `> Para cancelarlo usa *${p}cancel*`);
    }
}

async function sendLoose(sock: any, chat: string, pack: { name: string; author: string; items: PackItem[] }, quoted: any): Promise<number> {
    let sent = 0;
    for (const item of pack.items) {
        const sticker = await withExif(item.webp, pack.name, pack.author);
        const ok = await sock.sendMessage(chat, { sticker }, sent === 0 && quoted ? { quoted } : undefined)
            .then(() => true)
            .catch(() => false);
        if (ok) sent++;
        await sleep(LOOSE_DELAY_MS);
    }
    return sent;
}

const looseWords = new Set(['stickers', 'sticker', 'sueltos', 'suelto']);

/** `.done [nombre | autor]` envía el pack; `.done stickers` lo envía sticker por sticker. */
export async function finishPack(ctx: any): Promise<void> {
    const { sock, msg, args } = ctx;
    const p = ctx.usedPrefix || ctx.prefix || config.prefix || '.';
    const chat = msg.chat;
    const key = packKey(msg);
    const reply = (text: string) => sock.sendMessage(chat, { text }, { quoted: msg }).catch(() => null);

    const wantsLoose = looseWords.has(String(args?.[0] || '').toLowerCase());
    const session = sessions.get(key);

    if (!session) {
        const last = finished.get(key);
        if (last && wantsLoose) {
            const sent = await sendLoose(sock, chat, last, msg);
            await reply(`ׅ  ׄ  ✿ Listo: ${plural(sent)} del pack *${last.name}*.\n> Mantén pulsado un sticker y elige *Añadir a favoritos* para guardarlo.`);
            return;
        }
        if (last) {
            await reply(`ׅ  ׄ  ✿ El pack *${last.name}* ya fue enviado.\n\n> Si no te aparece usa *${p}done stickers*\n> Para crear otro usa *${p}spack*`);
            return;
        }
        await reply(`ׅ  ׄ  ✿ No tienes ningún pack en preparación.\n> Envía tus fotos con el mensaje *${p}spack* para empezar uno.`);
        return;
    }

    if (session.statusTimer) clearTimeout(session.statusTimer);
    session.statusTimer = null;
    session.sock = sock;
    touch(session);

    // Espera a que terminen de cargarse las fotos que aún estén en cola.
    await session.chain;
    if (sessions.get(key) !== session) return;

    if (!session.items.length) {
        await reply(`ׅ  ׄ  ✿ El pack todavía no tiene fotos.\n> Envía algunas y vuelve a usar *${p}done*, o cancélalo con *${p}cancel*.`);
        return;
    }

    if (!wantsLoose) {
        const given = parseNames(msg);
        if (given.name) session.name = given.name;
        if (given.author) session.author = given.author;
    }

    close(session);
    const pack = { name: session.name, author: session.author, items: session.items };
    const count = pack.items.length;

    if (!wantsLoose) {
        try {
            await reply(`ׅ  ׄ  ✿ Creando el pack *${pack.name}* con ${plural(count)}...`);
            await sendStickerPack(sock, chat, await buildPackInput(pack.name, pack.author, pack.items), msg);

            const timer = setTimeout(() => finished.delete(key), FINISHED_TTL_MS);
            timer.unref();
            finished.set(key, { ...pack, timer });

            await reply(
                `ׅ  ׄ  ✿ ¡Pack listo! *${pack.name}* » ${plural(count)}\n\n` +
                `Toca el pack y pulsa *Añadir* para guardarlo en tu WhatsApp.\n\n` +
                `> ¿No te aparece? Usa *${p}done stickers* y te los envío uno por uno.`);
            return;
        } catch (error: any) {
            console.error('[SPACK] No se pudo enviar el pack, se envían los stickers sueltos:', error?.message || error);
            await reply('ׅ  ׄ  ✿ No pude enviar el pack completo, te mando los stickers uno por uno.');
        }
    }

    const sent = await sendLoose(sock, chat, pack, msg);
    await reply(
        sent
            ? `ׅ  ׄ  ✿ Listo: ${plural(sent)} del pack *${pack.name}*.\n> Mantén pulsado un sticker y elige *Añadir a favoritos* para guardarlo.`
            : 'ׅ  ׄ  ✿ No pude enviar los stickers. Inténtalo de nuevo más tarde.');
}

/** `.cancel`: descarta el pack abierto. */
export async function cancelPack(ctx: any): Promise<void> {
    const { sock, msg } = ctx;
    const p = ctx.usedPrefix || ctx.prefix || config.prefix || '.';
    const session = sessions.get(packKey(msg));
    const reply = (text: string) => sock.sendMessage(msg.chat, { text }, { quoted: msg }).catch(() => null);

    if (!session) {
        await reply(`ׅ  ׄ  ✿ No tienes ningún pack en preparación.\n> Envía tus fotos con el mensaje *${p}spack* para empezar uno.`);
        return;
    }

    const count = session.items.length + session.pending;
    close(session);
    await reply(`ׅ  ׄ  ✿ Pack *${session.name}* cancelado. Se ${count === 1 ? 'descartó *1* foto' : `descartaron *${count}* fotos`}.`);
}
