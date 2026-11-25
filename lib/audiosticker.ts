import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import $protobuf from 'protobufjs/minimal.js';
import {
    extractMessageContent,
    generateMessageIDV2,
    getContentType,
    jidNormalizedUser,
    normalizeMessageContent,
    prepareWAMessageMedia,
    proto
} from '@whiskeysockets/baileys';
import { isAnimatedWebp, isGifBuffer, isWebpBuffer } from './stickers.ts';

/*
 * Stickers con audio nativos de WhatsApp (`audioStickerMessage`).
 *
 * En el protocolo de WhatsApp:
 * - `StickerMessage.audioMessage` (campo 26, wire tag 210) contiene el `AudioMessage` (OGG Opus).
 * - `Message.audioStickerMessage` (campo 134, wire tag 1074) envuelve `StickerMessage`
 *   dentro de un `FutureProofMessage`.
 *
 * Como el proto estático de Baileys aún no define los campos 26 y 134, aquí se
 * extienden en tiempo de ejecución `encode` y `decode` de forma idempotente.
 */

export type AudioStickerMode = 'escalado' | 'normal' | 'borrarn';

export interface ExtractedStickerAudio {
    buffer: Buffer;
    seconds: number;
    waveform: Buffer;
}

export interface SendAudioStickerInput {
    sticker: Buffer;
    audio: Buffer;
    seconds?: number;
    waveform?: Buffer;
    ephemeralExpiration?: number;
}

const TAG_STICKER_AUDIO = (26 << 3) | 2; // 210
const TAG_AUDIO_STICKER = (134 << 3) | 2; // 1074
const MAX_AUDIO_SECONDS = 30;
const MAX_WEBP_BYTES = 920_000;

let protoPatched = false;

export function registerAudioStickerProto(): void {
    if (protoPatched) return;
    protoPatched = true;

    const StickerMessage = proto.Message?.StickerMessage as any;
    const Message = proto.Message as any;
    if (!StickerMessage || !Message) return;

    if (!('audioMessage' in (StickerMessage.prototype || {}))) {
        const origStickerEncode = StickerMessage.encode.bind(StickerMessage);
        StickerMessage.encode = function encodeStickerWithAudio(m: any, w?: any) {
            const writer = origStickerEncode(m, w);
            if (m && m.audioMessage != null) {
                proto.Message.AudioMessage.encode(
                    m.audioMessage,
                    writer.uint32(TAG_STICKER_AUDIO).fork()
                ).ldelim();
            }
            return writer;
        };

        const origStickerDecode = StickerMessage.decode.bind(StickerMessage);
        StickerMessage.decode = function decodeStickerWithAudio(r: any, l?: number, e?: number) {
            const isReader = r instanceof $protobuf.Reader;
            const buf: Uint8Array = isReader ? r.buf : r;
            const start: number = isReader ? r.pos : 0;
            const m = origStickerDecode(r, l, e);
            const end: number = isReader ? r.pos : l === undefined ? buf.length : l;
            try {
                const scan = $protobuf.Reader.create(buf);
                scan.pos = start;
                while (scan.pos < end) {
                    const t = scan.uint32();
                    if (e !== undefined && t === e) break;
                    if ((t >>> 3) === 26 && (t & 7) === 2) {
                        m.audioMessage = proto.Message.AudioMessage.decode(scan, scan.uint32());
                    } else {
                        scan.skipType(t & 7);
                    }
                }
            } catch {}
            return m;
        };
    }

    if (!('audioStickerMessage' in (Message.prototype || {}))) {
        const origMsgEncode = Message.encode.bind(Message);
        Message.encode = function encodeMessageWithAudioSticker(m: any, w?: any) {
            const writer = origMsgEncode(m, w);
            if (m && m.audioStickerMessage != null) {
                proto.Message.FutureProofMessage.encode(
                    m.audioStickerMessage,
                    writer.uint32(TAG_AUDIO_STICKER).fork()
                ).ldelim();
            }
            return writer;
        };

        const origMsgDecode = Message.decode.bind(Message);
        Message.decode = function decodeMessageWithAudioSticker(r: any, l?: number, e?: number) {
            const isReader = r instanceof $protobuf.Reader;
            const buf: Uint8Array = isReader ? r.buf : r;
            const start: number = isReader ? r.pos : 0;
            const m = origMsgDecode(r, l, e);
            const end: number = isReader ? r.pos : l === undefined ? buf.length : l;
            try {
                const scan = $protobuf.Reader.create(buf);
                scan.pos = start;
                while (scan.pos < end) {
                    const t = scan.uint32();
                    if (e !== undefined && t === e) break;
                    if ((t >>> 3) === 134 && (t & 7) === 2) {
                        m.audioStickerMessage = proto.Message.FutureProofMessage.decode(scan, scan.uint32());
                    } else {
                        scan.skipType(t & 7);
                    }
                }
            } catch {}
            return m;
        };
    }
}

registerAudioStickerProto();

function tmpFile(ext: string): string {
    const dir = os.tmpdir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `denji-s2-${crypto.randomBytes(6).toString('hex')}.${ext}`);
}

function safeUnlink(file: string | null | undefined): void {
    try {
        if (file && fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
}

export function parseS2Mode(raw?: string): AudioStickerMode | null {
    const clean = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^-+/, '');
    if (clean === 'escalado') return 'escalado';
    if (clean === 'normal') return 'normal';
    if (clean === 'borrarn') return 'borrarn';
    return null;
}

export function webpDimensions(buf: Buffer): { width: number; height: number } {
    if (!isWebpBuffer(buf)) return { width: 512, height: 512 };
    let offset = 12;
    while (offset + 8 <= buf.length) {
        const tag = buf.toString('ascii', offset, offset + 4);
        const size = buf.readUInt32LE(offset + 4);
        const dataStart = offset + 8;
        if (tag === 'VP8X' && dataStart + 10 <= buf.length) {
            const width = buf.readUIntLE(dataStart + 4, 3) + 1;
            const height = buf.readUIntLE(dataStart + 7, 3) + 1;
            if (width > 0 && height > 0) return { width, height };
        } else if (tag === 'VP8 ' && dataStart + 10 <= buf.length) {
            if (buf[dataStart + 3] === 0x9d && buf[dataStart + 4] === 0x01 && buf[dataStart + 5] === 0x2a) {
                const width = buf.readUInt16LE(dataStart + 6) & 0x3fff;
                const height = buf.readUInt16LE(dataStart + 8) & 0x3fff;
                if (width > 0 && height > 0) return { width, height };
            }
        } else if (tag === 'VP8L' && dataStart + 5 <= buf.length && buf[dataStart] === 0x2f) {
            const bits = buf.readUInt32LE(dataStart + 1);
            const width = (bits & 0x3fff) + 1;
            const height = ((bits >>> 14) & 0x3fff) + 1;
            if (width > 0 && height > 0) return { width, height };
        }
        offset += 8 + size + (size % 2);
    }
    return { width: 512, height: 512 };
}

export function waveformFromPcm(pcm: Buffer, bars = 64): Buffer {
    const samples = Math.floor(pcm.length / 2);
    if (samples < bars) return Buffer.alloc(bars, 16);
    const block = Math.floor(samples / bars);
    const raw = new Array<number>(bars);
    let max = 0;
    for (let i = 0; i < bars; i++) {
        let sum = 0;
        const base = i * block;
        for (let j = 0; j < block; j++) {
            sum += Math.abs(pcm.readInt16LE((base + j) * 2));
        }
        const avg = sum / block;
        raw[i] = avg;
        if (avg > max) max = avg;
    }
    const scale = max > 0 ? 100 / max : 1;
    const out = Buffer.alloc(bars);
    for (let i = 0; i < bars; i++) {
        out[i] = Math.min(100, Math.floor(raw[i] * scale));
    }
    return out;
}

function swapFpsSyncArgs(args: string[], errText: string): string[] | null {
    if (/Unrecognized option 'fps_mode'/i.test(errText) && args.includes('-fps_mode')) {
        const next: string[] = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '-fps_mode' && i + 1 < args.length) {
                const v = args[++i];
                next.push('-vsync', v === 'passthrough' ? '0' : v);
            } else {
                next.push(args[i]);
            }
        }
        return next;
    }
    if (/Unrecognized option 'vsync'/i.test(errText) && args.includes('-vsync')) {
        const next: string[] = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '-vsync' && i + 1 < args.length) {
                const v = args[++i];
                next.push('-fps_mode', v === '0' ? 'passthrough' : v);
            } else {
                next.push(args[i]);
            }
        }
        return next;
    }
    return null;
}

function spawnFfmpegOnce(
    args: string[],
    opts: { timeoutMs?: number; captureStdout?: boolean; maxStdoutBytes?: number; loglevel?: string } = {}
): Promise<{ stdout: Buffer; stderr: string }> {
    const {
        timeoutMs = 50_000,
        captureStdout = false,
        maxStdoutBytes = 12 * 1024 * 1024,
        loglevel = 'error'
    } = opts;

    return new Promise((resolve, reject) => {
        let settled = false;
        const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', loglevel, ...args], {
            stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe']
        });

        const outChunks: Buffer[] = [];
        let outTotal = 0;
        let stderr = '';

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                try { proc.kill('SIGKILL'); } catch {}
                reject(new Error('ffmpeg tardó demasiado en procesar el video.'));
            }
        }, timeoutMs);
        timer.unref();

        if (captureStdout && proc.stdout) {
            proc.stdout.on('data', (chunk: Buffer) => {
                if (outTotal < maxStdoutBytes) {
                    const take = Math.min(chunk.length, maxStdoutBytes - outTotal);
                    outChunks.push(take === chunk.length ? chunk : chunk.subarray(0, take));
                    outTotal += take;
                }
            });
        }

        proc.stderr?.on('data', (chunk: Buffer) => {
            if (stderr.length < 16_000) stderr += chunk.toString();
        });

        proc.on('error', (err: any) => {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            if (err?.code === 'ENOENT') {
                reject(new Error('Falta instalar ffmpeg. En Termux ejecuta: pkg install ffmpeg'));
            } else {
                reject(err);
            }
        });

        proc.on('close', code => {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            const stdout = outChunks.length ? Buffer.concat(outChunks) : Buffer.alloc(0);
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(stderr.trim() || `ffmpeg finalizó con código ${code}`));
        });
    });
}

async function spawnFfmpeg(
    args: string[],
    opts: { timeoutMs?: number; captureStdout?: boolean; maxStdoutBytes?: number; loglevel?: string } = {}
): Promise<{ stdout: Buffer; stderr: string }> {
    try {
        return await spawnFfmpegOnce(args, opts);
    } catch (err: any) {
        const fallback = swapFpsSyncArgs(args, String(err?.message || ''));
        if (fallback) return spawnFfmpegOnce(fallback, opts);
        throw err;
    }
}

/**
 * Detecta barras negras exteriores (letterbox/pillarbox) con `cropdetect` de FFmpeg.
 */
async function detectBlackBarCrop(inFile: string): Promise<string> {
    try {
        const { stderr } = await spawnFfmpeg(
            ['-t', '8', '-i', inFile, '-vf', 'fps=4,cropdetect=24:2:0', '-frames:v', '24', '-an', '-f', 'null', '-'],
            { timeoutMs: 15_000, loglevel: 'info' }
        );
        const dimMatch = stderr.match(/Stream #\d+:\d+[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
        const iw = dimMatch ? Number(dimMatch[1]) : 0;
        const ih = dimMatch ? Number(dimMatch[2]) : 0;

        const crops = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
        if (!crops.length) return '';
        const last = crops[crops.length - 1];
        const cw = Number(last[1]);
        const ch = Number(last[2]);
        const cx = Number(last[3]);
        const cy = Number(last[4]);

        if (cw < 32 || ch < 32) return '';
        if (iw > 0 && ih > 0) {
            if (cw < iw * 0.25 || ch < ih * 0.25) return '';
            if (cw >= iw - 4 && ch >= ih - 4) return '';
        }
        return `crop=${cw}:${ch}:${cx}:${cy}`;
    } catch {
        return '';
    }
}

/**
 * Construye una máscara alfa (PNG en escala de grises) que borra las esquinas
 * negras conectadas a los 4 vértices del video sin afectar colores oscuros del
 * interior (ropa negra, cabello, texto o sombras).
 */
export function buildBlackCornerAlphaMask(
    rgbaFrames: Buffer[],
    width = 512,
    height = 512
): { maskPng: Buffer | null; erasedPixels: number } {
    const pixelCount = width * height;
    const frameBytes = pixelCount * 4;
    const validFrames = rgbaFrames.filter(f => f.length >= frameBytes);
    if (!validFrames.length) return { maskPng: null, erasedPixels: 0 };

    const first = validFrames[0];
    let vx0 = width;
    let vy0 = height;
    let vx1 = -1;
    let vy1 = -1;

    for (let y = 0; y < height; y++) {
        const rowOff = y * width;
        for (let x = 0; x < width; x++) {
            if (first[(rowOff + x) * 4 + 3] > 16) {
                if (x < vx0) vx0 = x;
                if (x > vx1) vx1 = x;
                if (y < vy0) vy0 = y;
                if (y > vy1) vy1 = y;
            }
        }
    }

    if (vx1 <= vx0 + 8 || vy1 <= vy0 + 8) {
        return { maskPng: null, erasedPixels: 0 };
    }

    const vw = vx1 - vx0 + 1;
    const vh = vy1 - vy0 + 1;
    const cx = (vx0 + vx1) / 2;
    const cy = (vy0 + vy1) / 2;
    const rx = Math.max(1, vw * 0.45);
    const ry = Math.max(1, vh * 0.45);

    const minFramesBlack = Math.max(1, Math.ceil(validFrames.length * 0.75));
    const candidate = new Uint8Array(pixelCount);

    for (let y = vy0; y <= vy1; y++) {
        const dyNorm = (y - cy) / ry;
        const dy2 = dyNorm * dyNorm;
        const rowOff = y * width;
        for (let x = vx0; x <= vx1; x++) {
            const dxNorm = (x - cx) / rx;
            // Proteger el núcleo central del video incluso si la escena es oscura.
            if (dxNorm * dxNorm + dy2 < 0.88) continue;

            const pIdx = rowOff + x;
            const bOff = pIdx * 4;
            let blackHits = 0;
            for (let k = 0; k < validFrames.length; k++) {
                const f = validFrames[k];
                const r = f[bOff];
                const g = f[bOff + 1];
                const b = f[bOff + 2];
                const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
                if (maxC <= 36 && r * 0.299 + g * 0.587 + b * 0.114 <= 28) {
                    blackHits++;
                }
            }
            if (blackHits >= minFramesBlack) {
                candidate[pIdx] = 1;
            }
        }
    }

    const erased = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let qHead = 0;
    let qTail = 0;

    const cornerSeeds: [number, number][] = [
        [vx0, vy0],
        [vx1, vy0],
        [vx0, vy1],
        [vx1, vy1]
    ];

    for (const [sx, sy] of cornerSeeds) {
        for (let dy = -2; dy <= 2; dy++) {
            const ny = sy + dy;
            if (ny < vy0 || ny > vy1) continue;
            for (let dx = -2; dx <= 2; dx++) {
                const nx = sx + dx;
                if (nx < vx0 || nx > vx1) continue;
                const idx = ny * width + nx;
                if (candidate[idx] && !erased[idx]) {
                    erased[idx] = 1;
                    queue[qTail++] = idx;
                }
            }
        }
    }

    while (qHead < qTail) {
        const idx = queue[qHead++];
        const x = idx % width;
        const y = (idx - x) / width;

        for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < vy0 || ny > vy1) continue;
            const rowOff = ny * width;
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                if (nx < vx0 || nx > vx1) continue;
                const nIdx = rowOff + nx;
                if (candidate[nIdx] && !erased[nIdx]) {
                    erased[nIdx] = 1;
                    queue[qTail++] = nIdx;
                }
            }
        }
    }

    const erasedPixels = qTail;
    if (erasedPixels === 0) {
        return { maskPng: null, erasedPixels: 0 };
    }

    const alpha = new Uint8Array(pixelCount);
    for (let y = vy0; y <= vy1; y++) {
        const rowOff = y * width;
        for (let x = vx0; x <= vx1; x++) {
            const idx = rowOff + x;
            if (first[idx * 4 + 3] <= 16 || erased[idx]) {
                alpha[idx] = 0;
            } else {
                alpha[idx] = 255;
            }
        }
    }

    // Suavizado antialiasing en el borde de las esquinas recortadas (evita halo negro).
    const feathered = new Uint8Array(alpha);
    for (let y = vy0; y <= vy1; y++) {
        const rowOff = y * width;
        for (let x = vx0; x <= vx1; x++) {
            const idx = rowOff + x;
            if (alpha[idx] === 0) continue;

            let touchesErased1 = false;
            let touchesErased2 = false;
            for (let dy = -2; dy <= 2 && !touchesErased1; dy++) {
                const ny = y + dy;
                if (ny < vy0 || ny > vy1) continue;
                for (let dx = -2; dx <= 2; dx++) {
                    const nx = x + dx;
                    if (nx < vx0 || nx > vx1) continue;
                    if (erased[ny * width + nx]) {
                        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
                            touchesErased1 = true;
                            break;
                        }
                        touchesErased2 = true;
                    }
                }
            }

            if (touchesErased1) {
                const bOff = idx * 4;
                const luma = first[bOff] * 0.299 + first[bOff + 1] * 0.587 + first[bOff + 2] * 0.114;
                feathered[idx] = luma < 65 ? 64 : 150;
            } else if (touchesErased2) {
                feathered[idx] = 215;
            }
        }
    }

    const png = new PNG({ width, height });
    for (let i = 0; i < pixelCount; i++) {
        const v = feathered[i];
        const off = i * 4;
        png.data[off] = v;
        png.data[off + 1] = v;
        png.data[off + 2] = v;
        png.data[off + 3] = 255;
    }

    return { maskPng: PNG.sync.write(png), erasedPixels };
}

async function sampleRgbaFrames(inFile: string, cropFilter: string, maxFrames = 8): Promise<Buffer[]> {
    const pre = cropFilter ? `${cropFilter},` : '';
    const vf =
        `${pre}fps=2,` +
        `scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,` +
        `format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000`;

    try {
        const { stdout } = await spawnFfmpeg(
            ['-t', '8', '-i', inFile, '-vf', vf, '-frames:v', String(maxFrames), '-an', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'],
            { captureStdout: true, maxStdoutBytes: maxFrames * 512 * 512 * 4 + 4096, timeoutMs: 25_000 }
        );
        const frameSize = 512 * 512 * 4;
        const frames: Buffer[] = [];
        for (let off = 0; off + frameSize <= stdout.length; off += frameSize) {
            frames.push(stdout.subarray(off, off + frameSize));
        }
        return frames;
    } catch {
        return [];
    }
}

/**
 * Filtro de respaldo por fotograma para `BorrarN` cuando las esquinas negras son dinámicas:
 * vuelve transparente el negro únicamente en las zonas exteriores de las 4 esquinas.
 */
function buildDynamicCornerKeyExpr(size = 512): string {
    const rad = Math.round(size * 0.18);
    const far = size - rad;
    const cornerDist2 =
        `if(lte(X,${rad})*lte(Y,${rad}),(X-${rad})*(X-${rad})+(Y-${rad})*(Y-${rad}),` +
        `if(gte(X,${far})*lte(Y,${rad}),(X-${far})*(X-${far})+(Y-${rad})*(Y-${rad}),` +
        `if(lte(X,${rad})*gte(Y,${far}),(X-${rad})*(X-${rad})+(Y-${far})*(Y-${far}),` +
        `if(gte(X,${far})*gte(Y,${far}),(X-${far})*(X-${far})+(Y-${far})*(Y-${far}),0))))`;
    const isNearBlack = `lte(r(X,Y),30)*lte(g(X,Y),30)*lte(b(X,Y),30)`;
    return `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(${cornerDist2},${rad * rad})*${isNearBlack},0,alpha(X,Y))'`;
}

/**
 * Convierte un video en WebP animado según el modo elegido:
 * - `escalado`: escala el sticker a 512x512 (por defecto).
 * - `normal`: conserva la escala/proporción original del video.
 * - `borrarn`: recorta bordes negros y borra las esquinas negras dejando transparencia.
 */
export async function videoToAudioStickerWebp(
    media: Buffer,
    mode: AudioStickerMode = 'normal',
    maxSeconds = MAX_AUDIO_SECONDS
): Promise<Buffer> {
    const ext = isGifBuffer(media) ? 'gif' : isWebpBuffer(media) ? 'webp' : 'mp4';
    const tmpIn = tmpFile(ext);
    const tmpOut = tmpFile('webp');
    let tmpMask: string | null = null;

    fs.writeFileSync(tmpIn, media);

    try {
        let cropFilter = '';
        let cornerMaskPng: Buffer | null = null;

        if (mode === 'borrarn') {
            cropFilter = await detectBlackBarCrop(tmpIn);
            const sampled = await sampleRgbaFrames(tmpIn, cropFilter, 8);
            const { maskPng, erasedPixels } = buildBlackCornerAlphaMask(sampled, 512, 512);
            if (maskPng && erasedPixels > 0) {
                cornerMaskPng = maskPng;
                tmpMask = tmpFile('png');
                fs.writeFileSync(tmpMask, cornerMaskPng);
            }
        }

        const capDur = Math.max(1, Math.min(maxSeconds, MAX_AUDIO_SECONDS));
        const attempts = [
            { fps: 15, q: '50', dur: String(Math.min(capDur, 10)) },
            { fps: 12, q: '35', dur: String(Math.min(capDur, 8)) },
            { fps: 10, q: '25', dur: String(Math.min(capDur, 6)) },
            { fps: 8, q: '15', dur: String(Math.min(capDur, 5)) }
        ];

        let result: Buffer | null = null;

        for (const opt of attempts) {
            safeUnlink(tmpOut);

            if (mode === 'borrarn' && tmpMask) {
                const pre = cropFilter ? `${cropFilter},` : '';
                const filterComplex =
                    `[0:v]${pre}fps=${opt.fps},` +
                    `scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,` +
                    `format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000[vid];` +
                    `[1:v]format=gray[msk];` +
                    `[vid][msk]alphamerge,format=yuva420p[out]`;

                await spawnFfmpeg([
                    '-y',
                    '-t', opt.dur,
                    '-i', tmpIn,
                    '-t', opt.dur,
                    '-loop', '1',
                    '-i', tmpMask,
                    '-filter_complex', filterComplex,
                    '-map', '[out]',
                    '-shortest',
                    '-c:v', 'libwebp',
                    '-lossless', '0',
                    '-q:v', opt.q,
                    '-compression_level', '4',
                    '-preset', 'default',
                    '-loop', '0',
                    '-an',
                    '-fps_mode', 'vfr',
                    tmpOut
                ]);
            } else {
                let vf: string;
                if (mode === 'escalado') {
                    vf = `fps=${opt.fps},scale=512:512:flags=lanczos,format=yuva420p`;
                } else if (mode === 'normal') {
                    vf =
                        `fps=${opt.fps},` +
                        `scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,` +
                        `format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,` +
                        `format=yuva420p`;
                } else {
                    const pre = cropFilter ? `${cropFilter},` : '';
                    const cornerFallback = !cropFilter ? `,${buildDynamicCornerKeyExpr(512)}` : '';
                    vf =
                        `${pre}fps=${opt.fps},` +
                        `scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,` +
                        `format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000` +
                        `${cornerFallback},format=yuva420p`;
                }

                await spawnFfmpeg([
                    '-y',
                    '-t', opt.dur,
                    '-i', tmpIn,
                    '-vf', vf,
                    '-c:v', 'libwebp',
                    '-lossless', '0',
                    '-q:v', opt.q,
                    '-compression_level', '4',
                    '-preset', 'default',
                    '-loop', '0',
                    '-an',
                    '-fps_mode', 'vfr',
                    tmpOut
                ]);
            }

            result = fs.readFileSync(tmpOut);
            if (result.length <= MAX_WEBP_BYTES) break;
        }

        if (!result?.length) {
            throw new Error('No se pudo generar el sticker animado.');
        }
        return result;
    } finally {
        safeUnlink(tmpIn);
        safeUnlink(tmpOut);
        safeUnlink(tmpMask);
    }
}

/**
 * Extrae y codifica la pista de audio de un video en OGG Opus compatible con
 * stickers con sonido de WhatsApp (`-vbr on -frame_duration 20 -avoid_negative_ts make_zero`).
 */
export async function extractStickerAudio(
    videoBuffer: Buffer,
    maxSeconds = MAX_AUDIO_SECONDS
): Promise<ExtractedStickerAudio> {
    const tmpIn = tmpFile('mp4');
    const tmpOut = tmpFile('ogg');
    const capDur = Math.max(1, Math.min(maxSeconds, MAX_AUDIO_SECONDS));

    fs.writeFileSync(tmpIn, videoBuffer);

    try {
        try {
            await spawnFfmpeg([
                '-y',
                '-i', tmpIn,
                '-vn',
                '-t', String(capDur),
                '-ar', '48000',
                '-ac', '1',
                '-c:a', 'libopus',
                '-b:a', '48k',
                '-vbr', 'on',
                '-compression_level', '10',
                '-frame_duration', '20',
                '-avoid_negative_ts', 'make_zero',
                '-map_metadata', '-1',
                '-f', 'ogg',
                tmpOut
            ]);
        } catch (err: any) {
            const msg = String(err?.message || '');
            if (/does not contain any stream|matches no streams|Invalid argument|Output file is empty/i.test(msg)) {
                const noAudioErr: any = new Error('NO_AUDIO_STREAM');
                noAudioErr.code = 'NO_AUDIO_STREAM';
                throw noAudioErr;
            }
            throw err;
        }

        let ogg = fs.readFileSync(tmpOut);
        if (!ogg.length) {
            const noAudioErr: any = new Error('NO_AUDIO_STREAM');
            noAudioErr.code = 'NO_AUDIO_STREAM';
            throw noAudioErr;
        }

        if (ogg.length > 900_000) {
            safeUnlink(tmpOut);
            await spawnFfmpeg([
                '-y',
                '-i', tmpIn,
                '-vn',
                '-t', String(capDur),
                '-ar', '16000',
                '-ac', '1',
                '-c:a', 'libopus',
                '-b:a', '24k',
                '-vbr', 'on',
                '-compression_level', '10',
                '-frame_duration', '20',
                '-application', 'voip',
                '-avoid_negative_ts', 'make_zero',
                '-map_metadata', '-1',
                '-f', 'ogg',
                tmpOut
            ]);
            ogg = fs.readFileSync(tmpOut);
        }

        const pcmRes = await spawnFfmpeg(
            ['-i', tmpOut, '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'],
            { captureStdout: true, maxStdoutBytes: 4 * 1024 * 1024, timeoutMs: 20_000 }
        ).catch(() => ({ stdout: Buffer.alloc(0), stderr: '' }));

        const pcmSeconds = pcmRes.stdout.length > 0 ? Math.ceil(pcmRes.stdout.length / 16_000) : 0;
        const seconds = pcmSeconds > 0 ? Math.min(pcmSeconds, Math.ceil(capDur)) : 5;
        const waveform = waveformFromPcm(pcmRes.stdout);

        return { buffer: ogg, seconds, waveform };
    } finally {
        safeUnlink(tmpIn);
        safeUnlink(tmpOut);
    }
}

function buildQuotedContextInfo(sock: any, jid: string, quoted?: any, ephemeralExpiration?: number): proto.IContextInfo | undefined {
    const contextInfo: proto.IContextInfo = {};
    let hasFields = false;

    if (quoted?.key && !jid.endsWith('@newsletter')) {
        const botJid = sock?.user?.id ? jidNormalizedUser(sock.user.id) : undefined;
        const rawParticipant = quoted.key.fromMe
            ? botJid
            : quoted.participant || quoted.key.participant || quoted.sender || quoted.key.remoteJid;

        let quotedMsg = normalizeMessageContent(quoted.message) || extractMessageContent(quoted.message) || quoted.message;
        const msgType = getContentType(quotedMsg);
        if (quotedMsg && msgType && quotedMsg[msgType]) {
            const cleanCopy = { ...(quotedMsg[msgType] as any) };
            delete cleanCopy.contextInfo;
            quotedMsg = proto.Message.create({ [msgType]: cleanCopy });
        }

        if (quoted.key.id) {
            contextInfo.stanzaId = quoted.key.id;
            hasFields = true;
        }
        if (rawParticipant) {
            contextInfo.participant = jidNormalizedUser(rawParticipant);
            hasFields = true;
        }
        if (quotedMsg) {
            contextInfo.quotedMessage = quotedMsg;
            hasFields = true;
        }
        if (quoted.key.remoteJid && quoted.key.remoteJid !== jid) {
            contextInfo.remoteJid = quoted.key.remoteJid;
            hasFields = true;
        }
    }

    const exp = Number(ephemeralExpiration || quoted?.expiration || quoted?.msg?.contextInfo?.expiration || 0);
    if (exp > 0) {
        contextInfo.expiration = exp;
        hasFields = true;
    }

    return hasFields ? contextInfo : undefined;
}

export function buildAudioStickerPayload(
    stickerMessage: proto.Message.IStickerMessage,
    audioMessage: proto.Message.IAudioMessage
): proto.IMessage {
    registerAudioStickerProto();
    const stickerWithAudio: any = {
        ...stickerMessage,
        audioMessage
    };
    const payload: any = {
        messageContextInfo: {
            messageSecret: crypto.randomBytes(32)
        },
        audioStickerMessage: {
            message: {
                stickerMessage: stickerWithAudio
            }
        }
    };
    return payload as proto.IMessage;
}

export async function sendAudioSticker(
    sock: any,
    jid: string,
    input: SendAudioStickerInput,
    quoted?: any
): Promise<string> {
    registerAudioStickerProto();

    const { width, height } = webpDimensions(input.sticker);
    const animated = isAnimatedWebp(input.sticker);
    const seconds = Math.max(1, Math.ceil(Number(input.seconds) || 5));
    const waveform = input.waveform?.length ? input.waveform : Buffer.alloc(64, 24);

    const [stickerMedia, audioMedia] = await Promise.all([
        prepareWAMessageMedia(
            {
                sticker: input.sticker,
                isAnimated: animated,
                width,
                height
            },
            { upload: sock.waUploadToServer }
        ),
        prepareWAMessageMedia(
            {
                audio: input.audio,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
                seconds,
                waveform
            } as any,
            { upload: sock.waUploadToServer }
        )
    ]);

    if (!stickerMedia?.stickerMessage) {
        throw new Error('No se pudo subir el sticker a WhatsApp.');
    }
    if (!audioMedia?.audioMessage) {
        throw new Error('No se pudo subir el audio del sticker a WhatsApp.');
    }

    const contextInfo = buildQuotedContextInfo(sock, jid, quoted, input.ephemeralExpiration);
    const stickerMessage: proto.Message.IStickerMessage = {
        ...stickerMedia.stickerMessage,
        width,
        height,
        isAnimated: animated,
        isLottie: false,
        ...(contextInfo ? { contextInfo } : {})
    };

    const audioMessage: proto.Message.IAudioMessage = {
        ...audioMedia.audioMessage,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        seconds,
        waveform
    };

    const message = buildAudioStickerPayload(stickerMessage, audioMessage);
    const messageId = generateMessageIDV2(sock?.user?.id);

    await sock.relayMessage(jid, message, {
        messageId,
        additionalAttributes: { type: 'text' }
    });

    return messageId;
}

export default {
    registerAudioStickerProto,
    parseS2Mode,
    webpDimensions,
    waveformFromPcm,
    buildBlackCornerAlphaMask,
    videoToAudioStickerWebp,
    extractStickerAudio,
    buildAudioStickerPayload,
    sendAudioSticker
};
