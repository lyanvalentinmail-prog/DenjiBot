import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { fileTypeFromBuffer } from 'file-type';
import exif from './stickers.ts';
import { ROOT } from './settings.ts';

/**
 * Motor de mejora y escalado de imágenes con bigger.pics (https://bigger.pics).
 *
 * Usa los modelos compactos de super-resolución ONNX de bigger.pics Model Lab
 * (`cdn.bigger.pics/v/<sha256>.onnx`, verificados por SHA-256 y cacheados en
 * `.cache/biggerpics/`) ejecutados con ONNX Runtime WebAssembly 1.30 — sin API
 * keys, sin marcas de agua, sin compilar módulos nativos (compatible con Termux
 * Android ARM64, Linux, macOS y Windows) y por mosaicos (tiles) para bajo uso
 * de memoria.
 */

export type BiggerPicsPresetId = 'auto' | '4x' | 'anime' | 'anime4x' | 'fast' | 'deblur' | 'restore';

export interface BiggerPicsModel {
    id: BiggerPicsPresetId;
    name: string;
    label: string;
    architecture: string;
    scale: 1 | 2 | 4;
    sizeMb: string;
    author: string;
    licence: string;
    fp16Sha256: string;
    fp32Sha256: string;
    pageUrl: string;
    toolUrl: string;
    /** Ajustar balance de blancos y contraste antes de escalar (modo restaurar). */
    restoreTone?: boolean;
}

export interface RgbaImage {
    width: number;
    height: number;
    data: Uint8Array;
    hasAlpha: boolean;
}

export interface BiggerPicsOptions {
    preset?: BiggerPicsPresetId;
    /** Lado máximo de salida en píxeles (por defecto 2048, igual que bigger.pics). */
    maxOutputSide?: number;
    /** Tamaño de mosaico de entrada (por defecto 192). */
    tileSize?: number;
    /** Margen de solapamiento de cada mosaico para evitar costuras (por defecto 12). */
    tilePad?: number;
    /** Formato de salida preferido ('jpeg' | 'png' | 'auto'). */
    format?: 'jpeg' | 'png' | 'auto';
    /** Calidad JPEG (1-100, por defecto 95 como bigger.pics). */
    jpegQuality?: number;
    /** Ruta opcional a un archivo .onnx local (para pruebas o modelos propios). */
    modelPath?: string;
    /** Tiempo máximo en milisegundos (por defecto 90_000). */
    timeoutMs?: number;
}

export interface BiggerPicsResult {
    buffer: Buffer;
    mime: 'image/jpeg' | 'image/png';
    width: number;
    height: number;
    inputWidth: number;
    inputHeight: number;
    scale: number;
    model: string;
    preset: BiggerPicsPresetId;
    provider: string;
    pageUrl: string;
}

export const BIGGERPICS_SITE = 'https://bigger.pics';
export const BIGGERPICS_CDN = 'https://cdn.bigger.pics/v';
export const BIGGERPICS_CACHE_DIR = path.join(ROOT, '.cache', 'biggerpics');

const BROWSER_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

export const BIGGERPICS_MODELS: Record<BiggerPicsPresetId, BiggerPicsModel> = {
    auto: {
        id: 'auto',
        name: 'RealESRGANv2 AnimeVideo xs-x2',
        label: 'General 2× (fotos, anime y limpieza JPEG)',
        architecture: 'RealESRGAN Compact',
        scale: 2,
        sizeMb: '1.3 MB',
        author: 'xinntao',
        licence: 'BSD-3-Clause',
        fp16Sha256: 'fe657bcc265533a5cd1a96a2afd5cd8e4a465e84a1f09dbfe97f6a030e8d226f',
        fp32Sha256: '1e21b4981b1ec12c663a9bfac1124548a6f9265e19a44ddd95f1d1995a7d8b8c',
        pageUrl: 'https://bigger.pics/models/2x-realesrganv2-animevideo-xsx2',
        toolUrl: 'https://bigger.pics/'
    },
    '4x': {
        id: '4x',
        name: 'LSDIR Compact 4×',
        label: 'Fotos 4× (máximo detalle fotográfico)',
        architecture: 'RealESRGAN Compact',
        scale: 4,
        sizeMb: '1.3 MB',
        author: 'helaman',
        licence: 'CC-BY-4.0',
        fp16Sha256: '5be37c90f7b00c97b1af3e0c69a90549a4eea54589c0a8c31e3d4bd6f6c9fc58',
        fp32Sha256: 'b711c2d8fa1283983267a45961a5ecdd51f0d5841049b8245feef23a33622725',
        pageUrl: 'https://bigger.pics/models/4x-lsdircompact',
        toolUrl: 'https://bigger.pics/tools/4k'
    },
    anime: {
        id: 'anime',
        name: '2x-NomosUni Compact MultiJPG',
        label: 'Anime 2× (ilustraciones, stickers y manga)',
        architecture: 'RealESRGAN Compact',
        scale: 2,
        sizeMb: '1.3 MB',
        author: 'helaman',
        licence: 'CC-BY-4.0',
        fp16Sha256: 'b67570953108bcb93a0e1555a6d3d93a00331679f86256167e81397b4bd32dfb',
        fp32Sha256: '9be6a8fc9e3fe57b50a914baf38a5fb9c5b25ac7d0ff9125966e2e9151b7f388',
        pageUrl: 'https://bigger.pics/models/2x-nomosuni-compact-multijpg',
        toolUrl: 'https://bigger.pics/tools/anime'
    },
    anime4x: {
        id: 'anime4x',
        name: '4x-NomosUni SPAN MultiJPG',
        label: 'Anime 4× (líneas nítidas y limpieza JPEG)',
        architecture: 'SPAN',
        scale: 4,
        sizeMb: '0.9 MB',
        author: 'helaman',
        licence: 'CC-BY-4.0',
        fp16Sha256: '70e98fd4ff75a78193a77dbd5daf9b92495e01e7ec3afa7ef84528c7807a0e59',
        fp32Sha256: 'cb69328ae5f212957b2f672f3d0b88998b8376ceed5ea08fa69a37688ec86d43',
        pageUrl: 'https://bigger.pics/models/4x-nomosuni-span-multijpg',
        toolUrl: 'https://bigger.pics/tools/anime'
    },
    fast: {
        id: 'fast',
        name: 'Swift-SRGAN 2×',
        label: 'Rápido 2× (ultraligero para móviles)',
        architecture: 'Swift-SRGAN',
        scale: 2,
        sizeMb: '0.6 MB',
        author: 'koushik0901',
        licence: 'CC0-1.0',
        fp16Sha256: '922d902847ebe23654050f295a9b8f16642f16d3a3a7088bd192e55fd626ef03',
        fp32Sha256: '6cc0780283c582c8df5cd0779be61c577199b41cdf605fea357da28a21f1d02d',
        pageUrl: 'https://bigger.pics/models/2x-swift-srgan',
        toolUrl: 'https://bigger.pics/'
    },
    deblur: {
        id: 'deblur',
        name: 'HurrDeblur SuperUltraCompact 1×',
        label: 'Nitidez 1× (corrige desenfoque suave sin agrandar)',
        architecture: 'RealESRGAN Compact',
        scale: 1,
        sizeMb: '0.1 MB',
        author: 'zarxrax',
        licence: 'WTFPL',
        fp16Sha256: '95a75fb96249b1f00dd68d8d57d95ff3ff7c15328aea2d40f1336b501dd95c00',
        fp32Sha256: 'de89428d8a8075630e540c894c9b33c0911ffd2832b8acd98bf8da63ab149f26',
        pageUrl: 'https://bigger.pics/models/1x-hurrdeblur-superultracompact',
        toolUrl: 'https://bigger.pics/tools/deblur'
    },
    restore: {
        id: 'restore',
        name: 'Restore Tone + RealESRGANv2 2×',
        label: 'Restaurar 2× (recupera contraste, color y detalle)',
        architecture: 'ToneBalance + RealESRGAN Compact',
        scale: 2,
        sizeMb: '1.3 MB',
        author: 'xinntao',
        licence: 'BSD-3-Clause',
        fp16Sha256: 'fe657bcc265533a5cd1a96a2afd5cd8e4a465e84a1f09dbfe97f6a030e8d226f',
        fp32Sha256: '1e21b4981b1ec12c663a9bfac1124548a6f9265e19a44ddd95f1d1995a7d8b8c',
        pageUrl: 'https://bigger.pics/tools/restore',
        toolUrl: 'https://bigger.pics/tools/restore',
        restoreTone: true
    }
};

export interface ParsedHdArgs {
    mode: 'upscale' | 'web' | 'help';
    preset: BiggerPicsPresetId;
    maxOutputSide: number;
    format: 'jpeg' | 'png' | 'auto';
}

/** Interpreta argumentos del usuario (`.hd`, `.hd 4x`, `.hd anime 4x`, `.hd deblur`, `.hd web`, etc.). */
export function parseBiggerPicsArgs(args: string[] = []): ParsedHdArgs {
    const tokens = args
        .map(a => String(a || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())
        .filter(Boolean);

    if (tokens.some(t => ['help', 'ayuda', 'modelos', 'models', 'modos', 'info', 'list', 'lista'].includes(t))) {
        return { mode: 'help', preset: 'auto', maxOutputSide: 2048, format: 'auto' };
    }
    if (tokens.some(t => ['web', 'link', 'url', 'site', 'sitio', 'navegador'].includes(t))) {
        const isAnime = tokens.some(t => ['anime', 'manga', 'cartoon', 'dibujo'].includes(t));
        const is4x = tokens.some(t => ['4x', 'x4', '4', '4k', 'ultra'].includes(t));
        const isDeblur = tokens.some(t => ['deblur', 'nitido', 'nitidez', 'enfoque', 'sharpen'].includes(t));
        const isRestore = tokens.some(t => ['restore', 'restaurar', 'antigua', 'color'].includes(t));
        const preset: BiggerPicsPresetId = isRestore
            ? 'restore'
            : isDeblur
                ? 'deblur'
                : isAnime && is4x
                    ? 'anime4x'
                    : isAnime
                        ? 'anime'
                        : is4x
                            ? '4x'
                            : 'auto';
        return { mode: 'web', preset, maxOutputSide: 2048, format: 'auto' };
    }

    const format: 'jpeg' | 'png' | 'auto' = tokens.includes('png')
        ? 'png'
        : tokens.includes('jpg') || tokens.includes('jpeg')
            ? 'jpeg'
            : 'auto';

    const wants4k = tokens.includes('4k');
    const wants4x = wants4k || tokens.some(t => ['4x', 'x4', '4', 'ultra', 'foto', 'photo'].includes(t));
    const wantsAnime = tokens.some(t => ['anime', 'manga', 'cartoon', 'dibujo', 'waifu', 'sticker'].includes(t));
    const wantsFast = tokens.some(t => ['fast', 'rapido', 'ligero', 'lite', 'swift'].includes(t));
    const wantsDeblur = tokens.some(t => ['deblur', 'nitido', 'nitidez', 'enfoque', 'sharpen', '1x'].includes(t));
    const wantsRestore = tokens.some(t => ['restore', 'restaurar', 'antigua', 'vieja'].includes(t));

    let preset: BiggerPicsPresetId = 'auto';
    if (wantsRestore) preset = 'restore';
    else if (wantsDeblur) preset = 'deblur';
    else if (wantsFast) preset = 'fast';
    else if (wantsAnime && wants4x) preset = 'anime4x';
    else if (wantsAnime) preset = 'anime';
    else if (wants4x) preset = '4x';

    return {
        mode: 'upscale',
        preset,
        maxOutputSide: wants4k ? 2560 : 2048,
        format
    };
}

const sha256Hex = (buf: Buffer): string => crypto.createHash('sha256').update(buf).digest('hex');

const inflightDownloads = new Map<string, Promise<string>>();

async function fetchModelBySha(sha256: string, timeoutMs = 45_000): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Hash de modelo inválido.');
    fs.mkdirSync(BIGGERPICS_CACHE_DIR, { recursive: true });
    const target = path.join(BIGGERPICS_CACHE_DIR, `${sha256}.onnx`);

    if (fs.existsSync(target)) {
        try {
            const existing = fs.readFileSync(target);
            if (sha256Hex(existing) === sha256) return target;
            fs.unlinkSync(target);
        } catch {}
    }

    const pending = inflightDownloads.get(sha256);
    if (pending) return pending;

    const task = (async () => {
        const url = `${BIGGERPICS_CDN}/${sha256}.onnx`;
        const headerSets: Record<string, string>[] = [
            {
                'user-agent': BROWSER_UA,
                accept: '*/*',
                referer: 'https://bigger.pics/',
                origin: 'https://app.bigger.pics'
            },
            {
                'user-agent': BROWSER_UA,
                accept: '*/*',
                referer: 'https://bigger.pics/'
            }
        ];

        let lastErr: Error | null = null;
        for (const headers of headerSets) {
            try {
                const res = await fetch(url, {
                    method: 'GET',
                    headers,
                    signal: AbortSignal.timeout(timeoutMs)
                });
                if (!res.ok) {
                    lastErr = new Error(`cdn.bigger.pics respondió HTTP ${res.status}`);
                    continue;
                }
                const buf = Buffer.from(await res.arrayBuffer());
                const got = sha256Hex(buf);
                if (got !== sha256) {
                    lastErr = new Error('Verificación SHA-256 fallida al descargar el modelo de bigger.pics.');
                    continue;
                }
                const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
                fs.writeFileSync(tmp, buf);
                fs.renameSync(tmp, target);
                return target;
            } catch (e: any) {
                lastErr = e instanceof Error ? e : new Error(String(e));
            }
        }
        throw lastErr || new Error('No se pudo descargar el modelo de bigger.pics.');
    })();

    inflightDownloads.set(sha256, task);
    try {
        return await task;
    } finally {
        inflightDownloads.delete(sha256);
    }
}

export async function ensureBiggerPicsModel(preset: BiggerPicsPresetId, timeoutMs = 45_000): Promise<string> {
    const meta = BIGGERPICS_MODELS[preset] || BIGGERPICS_MODELS.auto;
    try {
        return await fetchModelBySha(meta.fp16Sha256, timeoutMs);
    } catch {
        return fetchModelBySha(meta.fp32Sha256, timeoutMs);
    }
}

let ortModulePromise: Promise<any> | null = null;
const sessionCache = new Map<string, any>();
const MAX_CACHED_SESSIONS = 2;

// Cola secuencial para no ejecutar dos inferencias ONNX simultáneas y saturar la RAM en Termux.
let inferenceQueue: Promise<unknown> = Promise.resolve();
function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = inferenceQueue.then(fn, fn);
    inferenceQueue = next.then(() => undefined, () => undefined);
    return next;
}

async function getOrt(): Promise<any> {
    if (!ortModulePromise) {
        ortModulePromise = (async () => {
            const req = createRequire(import.meta.url);
            const ort: any = await import('onnxruntime-web/wasm');
            const distDir = path.dirname(req.resolve('onnxruntime-web/wasm')) + path.sep;
            if (ort.env?.wasm) {
                ort.env.wasm.wasmPaths = distDir;
                ort.env.wasm.numThreads = 1;
                ort.env.wasm.proxy = false;
            }
            if (ort.env) ort.env.logLevel = 'error';
            return ort;
        })().catch(err => {
            ortModulePromise = null;
            throw err;
        });
    }
    return ortModulePromise;
}

async function getSession(modelFile: string): Promise<{ ort: any; session: any }> {
    const ort = await getOrt();
    const cached = sessionCache.get(modelFile);
    if (cached) {
        sessionCache.delete(modelFile);
        sessionCache.set(modelFile, cached);
        return { ort, session: cached };
    }

    const bytes = fs.readFileSync(modelFile);
    const session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
    });

    if (sessionCache.size >= MAX_CACHED_SESSIONS) {
        const oldestKey = sessionCache.keys().next().value;
        if (oldestKey) {
            const old = sessionCache.get(oldestKey);
            sessionCache.delete(oldestKey);
            try { await old?.release?.(); } catch {}
        }
    }
    sessionCache.set(modelFile, session);
    return { ort, session };
}

/** Decodifica PNG, JPEG o WebP a RGBA en memoria. */
export async function decodeImage(buffer: Buffer): Promise<RgbaImage> {
    const ft = await fileTypeFromBuffer(buffer).catch(() => null);
    let working = buffer;
    let mime = ft?.mime || '';

    if (mime === 'image/webp') {
        working = await exif.webpToPng(buffer);
        mime = 'image/png';
    }

    const isPng =
        mime === 'image/png' ||
        (working.length > 8 &&
            working[0] === 0x89 &&
            working[1] === 0x50 &&
            working[2] === 0x4e &&
            working[3] === 0x47);

    const isJpeg =
        mime === 'image/jpeg' ||
        (working.length > 3 && working[0] === 0xff && working[1] === 0xd8 && working[2] === 0xff);

    if (isPng) {
        const decoded = PNG.sync.read(working);
        let hasAlpha = false;
        const d = decoded.data;
        for (let i = 3; i < d.length; i += 4) {
            if (d[i] < 250) {
                hasAlpha = true;
                break;
            }
        }
        return {
            width: decoded.width,
            height: decoded.height,
            data: new Uint8Array(d.buffer, d.byteOffset, d.byteLength),
            hasAlpha
        };
    }

    if (isJpeg) {
        const decoded = jpeg.decode(working, {
            useTArray: true,
            tolerantDecoding: true,
            maxResolutionInMP: 32,
            maxMemoryUsageInMB: 256
        });
        return {
            width: decoded.width,
            height: decoded.height,
            data: decoded.data,
            hasAlpha: false
        };
    }

    // Otros formatos (AVIF, BMP, etc.): convertir a PNG con ffmpeg si está disponible.
    const pngBuf = await exif.webpToPng(working);
    const decoded = PNG.sync.read(pngBuf);
    return {
        width: decoded.width,
        height: decoded.height,
        data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
        hasAlpha: false
    };
}

/** Codifica RGBA a PNG o JPEG (calidad 95 por defecto, como bigger.pics). */
export function encodeImage(
    img: RgbaImage,
    format: 'jpeg' | 'png' | 'auto' = 'auto',
    jpegQuality = 95
): { buffer: Buffer; mime: 'image/jpeg' | 'image/png' } {
    const outFmt: 'jpeg' | 'png' =
        format === 'auto' ? (img.hasAlpha ? 'png' : 'jpeg') : format;

    if (outFmt === 'png') {
        const png = new PNG({ width: img.width, height: img.height });
        png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
        return { buffer: PNG.sync.write(png, { colorType: img.hasAlpha ? 6 : 2 }), mime: 'image/png' };
    }

    // Si había transparencia y pidieron JPEG, componer sobre fondo blanco.
    let rgba = img.data;
    if (img.hasAlpha) {
        rgba = new Uint8Array(img.data.length);
        for (let i = 0; i < img.data.length; i += 4) {
            const a = img.data[i + 3] / 255;
            rgba[i] = Math.round(img.data[i] * a + 255 * (1 - a));
            rgba[i + 1] = Math.round(img.data[i + 1] * a + 255 * (1 - a));
            rgba[i + 2] = Math.round(img.data[i + 2] * a + 255 * (1 - a));
            rgba[i + 3] = 255;
        }
    }

    const encoded = jpeg.encode(
        { width: img.width, height: img.height, data: rgba },
        Math.max(60, Math.min(100, jpegQuality))
    );
    return { buffer: Buffer.from(encoded.data), mime: 'image/jpeg' };
}

/** Redimensionado bilineal suave en puro JS (sin dependencias nativas). */
export function resizeRgba(img: RgbaImage, newW: number, newH: number): RgbaImage {
    const targetW = Math.max(1, Math.round(newW));
    const targetH = Math.max(1, Math.round(newH));
    if (targetW === img.width && targetH === img.height) return img;

    const { width: srcW, height: srcH, data: src } = img;
    const dst = new Uint8Array(targetW * targetH * 4);
    const xRatio = srcW / targetW;
    const yRatio = srcH / targetH;

    for (let y = 0; y < targetH; y++) {
        const sy = Math.max(0, Math.min(srcH - 1, (y + 0.5) * yRatio - 0.5));
        const y0 = Math.floor(sy);
        const y1 = Math.min(srcH - 1, y0 + 1);
        const wy = sy - y0;

        for (let x = 0; x < targetW; x++) {
            const sx = Math.max(0, Math.min(srcW - 1, (x + 0.5) * xRatio - 0.5));
            const x0 = Math.floor(sx);
            const x1 = Math.min(srcW - 1, x0 + 1);
            const wx = sx - x0;

            const i00 = (y0 * srcW + x0) * 4;
            const i10 = (y0 * srcW + x1) * 4;
            const i01 = (y1 * srcW + x0) * 4;
            const i11 = (y1 * srcW + x1) * 4;
            const di = (y * targetW + x) * 4;

            const w00 = (1 - wx) * (1 - wy);
            const w10 = wx * (1 - wy);
            const w01 = (1 - wx) * wy;
            const w11 = wx * wy;

            dst[di] = Math.round(src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11);
            dst[di + 1] = Math.round(src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11);
            dst[di + 2] = Math.round(src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11);
            dst[di + 3] = Math.round(src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11);
        }
    }

    return { width: targetW, height: targetH, data: dst, hasAlpha: img.hasAlpha };
}

/**
 * Corrección de desvanecimiento y dominante de color inspirada en bigger.pics/tools/restore:
 * estira cada canal entre sus percentiles 0.5% y 99.5% y equilibra tonos neutros suavemente.
 */
export function restorePhotoTone(img: RgbaImage, strength = 0.75): RgbaImage {
    const s = Math.max(0, Math.min(1, strength));
    const n = img.width * img.height;
    if (n < 16 || s === 0) return img;

    const histR = new Uint32Array(256);
    const histG = new Uint32Array(256);
    const histB = new Uint32Array(256);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 16) continue;
        histR[d[i]]++;
        histG[d[i + 1]]++;
        histB[d[i + 2]]++;
    }

    const percentile = (hist: Uint32Array, p: number): number => {
        const total = hist.reduce((a, b) => a + b, 0);
        if (!total) return p < 0.5 ? 0 : 255;
        const target = total * p;
        let acc = 0;
        for (let v = 0; v < 256; v++) {
            acc += hist[v];
            if (acc >= target) return v;
        }
        return 255;
    };

    const lo = [percentile(histR, 0.005), percentile(histG, 0.005), percentile(histB, 0.005)];
    const hi = [percentile(histR, 0.995), percentile(histG, 0.995), percentile(histB, 0.995)];
    const out = new Uint8Array(d.length);

    for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            const v = d[i + c];
            const span = Math.max(24, hi[c] - lo[c]);
            const stretched = Math.max(0, Math.min(255, ((v - lo[c]) * 255) / span));
            out[i + c] = Math.round(v * (1 - s) + stretched * s);
        }
        out[i + 3] = d[i + 3];
    }

    return { width: img.width, height: img.height, data: out, hasAlpha: img.hasAlpha };
}

/** Filtro Unsharp Mask puro en JS (respaldo local si no hay red ni ffmpeg). */
export function upscaleLocalPureJs(img: RgbaImage, scale = 2, maxSide = 2048): RgbaImage {
    const longest = Math.max(img.width, img.height);
    const factor = Math.min(scale, maxSide / Math.max(1, longest));
    const targetW = Math.max(1, Math.round(img.width * Math.max(1, factor)));
    const targetH = Math.max(1, Math.round(img.height * Math.max(1, factor)));
    const resized = resizeRgba(img, targetW, targetH);

    const { width: w, height: h, data: src } = resized;
    const out = new Uint8Array(src.length);
    const amount = 0.65;

    for (let y = 0; y < h; y++) {
        const ym = Math.max(0, y - 1);
        const yp = Math.min(h - 1, y + 1);
        for (let x = 0; x < w; x++) {
            const xm = Math.max(0, x - 1);
            const xp = Math.min(w - 1, x + 1);
            const idx = (y * w + x) * 4;
            const n0 = (ym * w + x) * 4;
            const n1 = (yp * w + x) * 4;
            const n2 = (y * w + xm) * 4;
            const n3 = (y * w + xp) * 4;
            for (let c = 0; c < 3; c++) {
                const center = src[idx + c];
                const blur = (center * 4 + src[n0 + c] + src[n1 + c] + src[n2 + c] + src[n3 + c]) / 8;
                const sharp = center + (center - blur) * amount;
                out[idx + c] = sharp <= 0 ? 0 : sharp >= 255 ? 255 : Math.round(sharp);
            }
            out[idx + 3] = src[idx + 3];
        }
    }
    return { width: w, height: h, data: out, hasAlpha: resized.hasAlpha };
}

function clampByte(v: number): number {
    const r = Math.round(v * 255);
    return r <= 0 ? 0 : r >= 255 ? 255 : r;
}

const reflectIndex = (idx: number, max: number): number => {
    if (idx < 0) return Math.min(max - 1, -idx);
    if (idx >= max) return Math.max(0, 2 * max - idx - 2);
    return idx;
};

/**
 * Ejecuta super-resolución ONNX por mosaicos con borde reflejado (sin costuras),
 * siguiendo el formato exacto de bigger.pics Model Lab:
 * entrada `float32 [1, 3, H, W]` planar RGB en `[0, 1]` → salida `float32 [1, 3, H*s, W*s]`.
 */
async function runTiledOnnx(
    ort: any,
    session: any,
    img: RgbaImage,
    scaleHint: number,
    tileSize: number,
    tilePad: number,
    deadline: number
): Promise<{ image: RgbaImage; actualScale: number }> {
    const { width, height, data } = img;
    const inputName: string = session.inputNames?.[0] || 'input';
    const outputName: string = session.outputNames?.[0] || 'output';

    const step = Math.max(32, tileSize);
    const pad = width <= step && height <= step ? 0 : Math.max(4, tilePad);

    let outW = width * scaleHint;
    let outH = height * scaleHint;
    let actualScale = scaleHint;
    let outRgba: Uint8Array | null = null;

    const alphaScaled = img.hasAlpha ? resizeRgba(img, outW, outH).data : null;

    for (let ty = 0; ty < height; ty += step) {
        for (let tx = 0; tx < width; tx += step) {
            if (Date.now() > deadline) {
                throw new Error('Tiempo de espera agotado al mejorar la imagen con bigger.pics.');
            }

            const coreW = Math.min(step, width - tx);
            const coreH = Math.min(step, height - ty);
            const inW = coreW + pad * 2;
            const inH = coreH + pad * 2;
            const planeSize = inW * inH;
            const rgb = new Float32Array(3 * planeSize);

            for (let py = 0; py < inH; py++) {
                const sy = reflectIndex(ty + py - pad, height);
                const rowOff = sy * width;
                const dstRow = py * inW;
                for (let px = 0; px < inW; px++) {
                    const sx = reflectIndex(tx + px - pad, width);
                    const si = (rowOff + sx) * 4;
                    const p = dstRow + px;
                    rgb[p] = data[si] / 255;
                    rgb[planeSize + p] = data[si + 1] / 255;
                    rgb[2 * planeSize + p] = data[si + 2] / 255;
                }
            }

            const inputTensor = new ort.Tensor('float32', rgb, [1, 3, inH, inW]);
            let outputs: any;
            try {
                outputs = await session.run({ [inputName]: inputTensor });
            } finally {
                try { inputTensor.dispose?.(); } catch {}
            }

            const outTensor = outputs[outputName] || outputs[Object.keys(outputs)[0]];
            try {
                const dims: number[] = outTensor.dims.map(Number);
                const tileOutH = dims[2];
                const tileOutW = dims[3];
                const detected = Math.max(1, Math.round(tileOutW / inW));

                if (!outRgba) {
                    actualScale = detected;
                    outW = width * actualScale;
                    outH = height * actualScale;
                    outRgba = new Uint8Array(outW * outH * 4);
                }

                const oData: Float32Array = outTensor.data;
                const outPlane = tileOutW * tileOutH;
                const cropX = pad * actualScale;
                const cropY = pad * actualScale;
                const copyW = coreW * actualScale;
                const copyH = coreH * actualScale;
                const dstBaseX = tx * actualScale;
                const dstBaseY = ty * actualScale;

                for (let cy = 0; cy < copyH; cy++) {
                    const srcRow = (cropY + cy) * tileOutW + cropX;
                    const dstRow = (dstBaseY + cy) * outW + dstBaseX;
                    for (let cx = 0; cx < copyW; cx++) {
                        const sp = srcRow + cx;
                        const di = (dstRow + cx) * 4;
                        outRgba[di] = clampByte(oData[sp]);
                        outRgba[di + 1] = clampByte(oData[outPlane + sp]);
                        outRgba[di + 2] = clampByte(oData[2 * outPlane + sp]);
                        outRgba[di + 3] =
                            alphaScaled && actualScale === scaleHint ? alphaScaled[di + 3] : 255;
                    }
                }
            } finally {
                try { outTensor?.dispose?.(); } catch {}
            }

            // Ceder el event loop entre mosaicos para mantener vivo el socket de WhatsApp.
            await new Promise<void>(resolve => setImmediate(resolve));
        }
    }

    if (!outRgba) throw new Error('No se generó salida al procesar la imagen.');

    if (img.hasAlpha && actualScale !== scaleHint) {
        const rescaledAlpha = resizeRgba(img, outW, outH).data;
        for (let i = 3; i < outRgba.length; i += 4) outRgba[i] = rescaledAlpha[i];
    }

    return {
        image: { width: outW, height: outH, data: outRgba, hasAlpha: img.hasAlpha },
        actualScale
    };
}

/**
 * Mejora y escala una imagen usando el motor ONNX de bigger.pics.
 */
export async function upscaleWithBiggerPics(
    imageBuffer: Buffer,
    options: BiggerPicsOptions = {}
): Promise<BiggerPicsResult> {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < 32) {
        throw new Error('Imagen vacía o no válida.');
    }
    if (imageBuffer.length > 16 * 1024 * 1024) {
        throw new Error('La imagen supera el límite de 16 MB de bigger.pics.');
    }

    const preset: BiggerPicsPresetId = options.preset && BIGGERPICS_MODELS[options.preset]
        ? options.preset
        : 'auto';
    const meta = BIGGERPICS_MODELS[preset];
    const maxOutputSide = Math.max(256, Math.min(4096, options.maxOutputSide ?? 2048));
    const tileSize = Math.max(64, Math.min(384, options.tileSize ?? 192));
    const tilePad = Math.max(0, Math.min(32, options.tilePad ?? 12));
    const timeoutMs = Math.max(10_000, options.timeoutMs ?? 90_000);
    const deadline = Date.now() + timeoutMs;

    const decoded = await decodeImage(imageBuffer);
    const inputWidth = decoded.width;
    const inputHeight = decoded.height;

    // Respetar el tope de 2048 px del lado mayor (igual que bigger.pics) y mantener tiempos rápidos en CPU/Termux.
    const maxInputForScale =
        meta.scale === 4
            ? Math.min(512, Math.floor(maxOutputSide / 4))
            : meta.scale === 2
                ? Math.min(960, Math.floor(maxOutputSide / 2))
                : Math.min(1024, maxOutputSide);

    let prepared = decoded;
    const longestIn = Math.max(prepared.width, prepared.height);
    if (longestIn > maxInputForScale) {
        const ratio = maxInputForScale / longestIn;
        prepared = resizeRgba(prepared, prepared.width * ratio, prepared.height * ratio);
    }

    if (meta.restoreTone) {
        prepared = restorePhotoTone(prepared, 0.75);
    }

    const modelFile = options.modelPath || (await ensureBiggerPicsModel(preset, Math.min(45_000, timeoutMs)));

    const { image: upscaled, actualScale } = await runSerialized(async () => {
        const { ort, session } = await getSession(modelFile);
        return runTiledOnnx(ort, session, prepared, meta.scale, tileSize, tilePad, deadline);
    });

    let finalImg = upscaled;
    const longestOut = Math.max(finalImg.width, finalImg.height);
    if (longestOut > maxOutputSide) {
        const r = maxOutputSide / longestOut;
        finalImg = resizeRgba(finalImg, finalImg.width * r, finalImg.height * r);
    }

    const { buffer, mime } = encodeImage(finalImg, options.format ?? 'auto', options.jpegQuality ?? 95);

    return {
        buffer,
        mime,
        width: finalImg.width,
        height: finalImg.height,
        inputWidth,
        inputHeight,
        scale: actualScale,
        model: meta.name,
        preset,
        provider: 'bigger.pics',
        pageUrl: meta.pageUrl
    };
}

/** Libera las sesiones ONNX cacheadas (útil en tests o al apagar el proceso). */
export async function disposeBiggerPicsSessions(): Promise<void> {
    for (const session of sessionCache.values()) {
        try { await session?.release?.(); } catch {}
    }
    sessionCache.clear();
}

export default {
    BIGGERPICS_SITE,
    BIGGERPICS_CDN,
    BIGGERPICS_CACHE_DIR,
    BIGGERPICS_MODELS,
    parseBiggerPicsArgs,
    ensureBiggerPicsModel,
    decodeImage,
    encodeImage,
    resizeRgba,
    restorePhotoTone,
    upscaleLocalPureJs,
    upscaleWithBiggerPics,
    disposeBiggerPicsSessions
};
