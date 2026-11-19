import webp from 'node-webpmux';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

/**
 * Renderizado de stickers/portadas sin depender de ffmpeg.
 *
 * Usa el libwebp (WASM) que trae `node-webpmux` para decodificar WebP y
 * `pngjs`/`jpeg-js` para codificar. Así los paquetes de stickers se pueden
 * construir también en entornos donde ffmpeg no está instalado.
 */

const webpModule: any = webp as any;

let libReady: Promise<any> | null = null;
function ensureLib(): Promise<any> {
    if (!libReady) {
        const p: Promise<any> = webpModule.Image.initLib().then(() => webpModule.Image.libwebp);
        libReady = p;
        return p;
    }
    return libReady;
}

export interface RgbaImage {
    /** Píxeles RGBA crudos (4 bytes por píxel). */
    data: Uint8Array;
    width: number;
    height: number;
}

/** Decodifica un WebP estático o el primer frame de un animado a RGBA crudo. */
export async function decodeWebp(input: Buffer): Promise<RgbaImage> {
    await ensureLib();
    const img = new webpModule.Image();
    await img.load(input);
    const width = Number(img.width);
    const height = Number(img.height);
    if (!width || !height) throw new Error('No se pudo leer el tamaño del WebP.');
    const data: Uint8Array = img.hasAnim ? await img.getFrameData(0) : await img.getImageData();
    if (!data || data.length < width * height * 4) {
        throw new Error('No se pudo decodificar el WebP.');
    }
    return { data, width, height };
}

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);

/** Reescalado bilineal RGBA. */
export function resizeRgba(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Buffer {
    const out = Buffer.alloc(dw * dh * 4);
    const xRatio = sw / dw;
    const yRatio = sh / dh;
    for (let j = 0; j < dh; j++) {
        const yy = (j + 0.5) * yRatio - 0.5;
        const y0 = Math.floor(yy);
        const fy = yy - y0;
        const yA = clamp(y0, 0, sh - 1);
        const yB = clamp(y0 + 1, 0, sh - 1);
        for (let i = 0; i < dw; i++) {
            const xx = (i + 0.5) * xRatio - 0.5;
            const x0 = Math.floor(xx);
            const fx = xx - x0;
            const xA = clamp(x0, 0, sw - 1);
            const xB = clamp(x0 + 1, 0, sw - 1);
            const rowA = yA * sw;
            const rowB = yB * sw;
            const dst = (j * dw + i) * 4;
            for (let c = 0; c < 4; c++) {
                const p00 = src[(rowA + xA) * 4 + c];
                const p01 = src[(rowA + xB) * 4 + c];
                const p10 = src[(rowB + xA) * 4 + c];
                const p11 = src[(rowB + xB) * 4 + c];
                const top = p00 + (p01 - p00) * fx;
                const bottom = p10 + (p11 - p10) * fx;
                out[dst + c] = Math.round(top + (bottom - top) * fy);
            }
        }
    }
    return out;
}

/** Escala manteniendo proporción y centra sobre un lienzo `size`x`size` con relleno dado. */
export function containRgba(
    src: Uint8Array,
    sw: number,
    sh: number,
    size: number,
    fill: [number, number, number, number]
): Buffer {
    const scale = Math.min(size / sw, size / sh);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const resized = resizeRgba(src, sw, sh, dw, dh);

    const out = Buffer.alloc(size * size * 4);
    for (let i = 0; i < out.length; i += 4) {
        out[i] = fill[0];
        out[i + 1] = fill[1];
        out[i + 2] = fill[2];
        out[i + 3] = fill[3];
    }
    const ox = Math.floor((size - dw) / 2);
    const oy = Math.floor((size - dh) / 2);
    for (let y = 0; y < dh; y++) {
        resized.copy(out, ((oy + y) * size + ox) * 4, y * dw * 4, (y + 1) * dw * 4);
    }
    return out;
}

/** Aplana RGBA sobre un color de fondo opaco y devuelve RGB puro. */
function flattenToRgb(rgba: Buffer, bg: [number, number, number]): Buffer {
    const out = Buffer.alloc((rgba.length / 4) * 3);
    for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
        const a = rgba[i + 3] / 255;
        out[o] = Math.round(rgba[i] * a + bg[0] * (1 - a));
        out[o + 1] = Math.round(rgba[i + 1] * a + bg[1] * (1 - a));
        out[o + 2] = Math.round(rgba[i + 2] * a + bg[2] * (1 - a));
    }
    return out;
}

export function encodeWebp(rgba: Buffer, width: number, height: number, quality = 85): Buffer {
    const lib = webpModule.Image.libwebp;
    if (!lib) throw new Error('libwebp no está inicializado.');
    const ret = lib.encodeImage(rgba, width, height, { quality, method: 4 });
    if (ret?.res !== 0 || !ret?.buf) {
        throw new Error(`No se pudo codificar el WebP (código ${ret?.res}).`);
    }
    return Buffer.from(ret.buf);
}

export function encodePng(rgba: Buffer, width: number, height: number): Buffer {
    const png = new PNG({ width, height });
    Buffer.from(rgba).copy(png.data);
    return PNG.sync.write(png);
}

export function encodeJpeg(rgba: Buffer, width: number, height: number, quality = 80, bg: [number, number, number] = [255, 255, 255]): Buffer {
    const rgb = flattenToRgb(rgba, bg);
    const raw = { data: rgb, width, height };
    return jpeg.encode(raw, quality).data;
}

/** Bandeja del paquete: WebP `size`x`size` con fondo transparente. */
export async function makeTrayWebp(coverWebp: Buffer, size = 96): Promise<Buffer> {
    const { data, width, height } = await decodeWebp(coverWebp);
    const canvas = containRgba(data, width, height, size, [0, 0, 0, 0]);
    return encodeWebp(canvas, size, size, 90);
}

/** Miniatura del paquete: JPEG `size`x`size` sobre fondo blanco. */
export async function makeThumbJpeg(coverWebp: Buffer, size = 252, quality = 80): Promise<Buffer> {
    const { data, width, height } = await decodeWebp(coverWebp);
    const canvas = containRgba(data, width, height, size, [255, 255, 255, 255]);
    return encodeJpeg(canvas, size, size, quality);
}

/** PNG `size`x`size` (transparente u opaco según `fill`). */
export async function makePng(coverWebp: Buffer, size: number, fill: [number, number, number, number] = [0, 0, 0, 0]): Promise<Buffer> {
    const { data, width, height } = await decodeWebp(coverWebp);
    const canvas = containRgba(data, width, height, size, fill);
    return encodePng(canvas, size, size);
}
