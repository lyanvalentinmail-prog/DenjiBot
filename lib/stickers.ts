import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import webp from 'node-webpmux';
import config from '#config';

const PACK_ID = 'https://github.com/lyanvalentinmail-prog/DenjiBot';

function tmpFile(ext: string): string {
    const dir = tmpdir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `denji-${randomBytes(6).toString('hex')}.${ext}`);
}

export function isWebpBuffer(buf: Buffer): boolean {
    return (
        Buffer.isBuffer(buf) &&
        buf.length > 12 &&
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
}

export function isMp4Buffer(buf: Buffer): boolean {
    return (
        Buffer.isBuffer(buf) &&
        buf.length > 12 &&
        buf.subarray(4, 8).toString('ascii') === 'ftyp'
    );
}

export function isGifBuffer(buf: Buffer): boolean {
    return (
        Buffer.isBuffer(buf) &&
        buf.length > 6 &&
        (buf.subarray(0, 6).toString('ascii') === 'GIF89a' ||
            buf.subarray(0, 6).toString('ascii') === 'GIF87a')
    );
}

export function runFfmpeg(args: string[], timeoutMs = 45_000): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
            stdio: ['ignore', 'ignore', 'pipe']
        });
        let stderr = '';
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                try { proc.kill('SIGKILL'); } catch {}
                reject(new Error('ffmpeg tardó demasiado en procesar el archivo.'));
            }
        }, timeoutMs);
        timer.unref();

        proc.stderr?.on('data', chunk => {
            if (stderr.length < 4000) stderr += chunk.toString();
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
            if (code === 0) resolve();
            else reject(new Error(stderr.trim() || `ffmpeg finalizó con código ${code}`));
        });
    });
}

function safeUnlink(file: string): void {
    try {
        if (file && fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
}

export async function imageToWebp(media: Buffer): Promise<Buffer> {
    if (isWebpBuffer(media)) return media;
    const tmpIn = tmpFile('img');
    const tmpOut = tmpFile('webp');
    fs.writeFileSync(tmpIn, media);
    try {
        await runFfmpeg([
            '-y',
            '-i', tmpIn,
            '-frames:v', '1',
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
            '-c:v', 'libwebp',
            '-lossless', '0',
            '-q:v', '80',
            '-compression_level', '4',
            '-an',
            tmpOut
        ]);
        return fs.readFileSync(tmpOut);
    } finally {
        safeUnlink(tmpIn);
        safeUnlink(tmpOut);
    }
}

export async function videoToWebp(media: Buffer, extraVf = ''): Promise<Buffer> {
    if (isWebpBuffer(media) && !extraVf && media.length <= 950_000) return media;
    const tmpIn = tmpFile(isGifBuffer(media) ? 'gif' : isWebpBuffer(media) ? 'webp' : 'mp4');
    const tmpOut = tmpFile('webp');
    fs.writeFileSync(tmpIn, media);
    try {
        const prefixFilter = extraVf ? `${extraVf},` : '';
        const attempts = [
            { size: 512, fps: 12, duration: '8', q: '50' },
            { size: 384, fps: 10, duration: '6', q: '35' },
            { size: 320, fps: 8, duration: '5', q: '25' }
        ];
        let result: Buffer | null = null;
        for (const opt of attempts) {
            safeUnlink(tmpOut);
            const vf = `${prefixFilter}fps=${opt.fps},scale=${opt.size}:${opt.size}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=${opt.size}:${opt.size}:(ow-iw)/2:(oh-ih)/2:color=#00000000`;
            await runFfmpeg([
                '-y',
                '-t', opt.duration,
                '-i', tmpIn,
                '-vf', vf,
                '-c:v', 'libwebp',
                '-lossless', '0',
                '-q:v', opt.q,
                '-compression_level', '4',
                '-preset', 'default',
                '-loop', '0',
                '-an',
                '-vsync', '0',
                tmpOut
            ]);
            result = fs.readFileSync(tmpOut);
            if (result.length <= 950_000) break;
        }
        return result!;
    } finally {
        safeUnlink(tmpIn);
        safeUnlink(tmpOut);
    }
}

export async function webpToPng(media: Buffer): Promise<Buffer> {
    const tmpIn = tmpFile('webp');
    const tmpOut = tmpFile('png');
    fs.writeFileSync(tmpIn, media);
    try {
        await runFfmpeg(['-y', '-i', tmpIn, '-frames:v', '1', tmpOut]);
        return fs.readFileSync(tmpOut);
    } finally {
        safeUnlink(tmpIn);
        safeUnlink(tmpOut);
    }
}

export async function gifToMp4(media: Buffer): Promise<Buffer> {
    if (isMp4Buffer(media)) return media;
    const tmpIn = tmpFile(isGifBuffer(media) ? 'gif' : 'bin');
    const tmpOut = tmpFile('mp4');
    fs.writeFileSync(tmpIn, media);
    try {
        await runFfmpeg([
            '-y',
            '-i', tmpIn,
            '-movflags', 'faststart',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '26',
            '-an',
            tmpOut
        ]);
        return fs.readFileSync(tmpOut);
    } finally {
        safeUnlink(tmpIn);
        safeUnlink(tmpOut);
    }
}

export async function resizeToJpeg(media: Buffer, maxSide = 720, square = true): Promise<Buffer> {
    const tmpIn = tmpFile('img');
    const tmpOut = tmpFile('jpg');
    fs.writeFileSync(tmpIn, media);
    try {
        const vf = square
            ? `scale=${maxSide}:${maxSide}:force_original_aspect_ratio=increase,crop=${maxSide}:${maxSide}`
            : `scale='min(${maxSide},iw)':'min(${maxSide},ih)':force_original_aspect_ratio=decrease,pad=${maxSide}:${maxSide}:(ow-iw)/2:(oh-ih)/2:black`;
        await runFfmpeg([
            '-y',
            '-i', tmpIn,
            '-frames:v', '1',
            '-vf', vf,
            '-q:v', '3',
            tmpOut
        ]);
        return fs.readFileSync(tmpOut);
    } finally {
        safeUnlink(tmpIn);
        safeUnlink(tmpOut);
    }
}

function buildExifBuffer(
    packname: string,
    author: string,
    categories: string[] = [''],
    extra: Record<string, any> = {},
    packId: string = PACK_ID
): Buffer {
    const json = {
        'sticker-pack-id': packId,
        'sticker-pack-name': packname,
        'sticker-pack-publisher': author,
        emojis: categories,
        ...extra
    };
    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);
    return exif;
}

async function saveWebpWithExif(
    webpData: Buffer,
    metadata: { packname?: string; author?: string; categories?: string[] } = {}
): Promise<string> {
    const tmpOut = tmpFile('webp');
    const img = new webp.Image();
    await img.load(webpData);
    img.exif = buildExifBuffer(
        metadata.packname ?? config.botName,
        metadata.author ?? config.devName,
        metadata.categories ?? ['']
    );
    await img.save(tmpOut);
    return tmpOut;
}

export async function writeExifImg(
    media: Buffer,
    metadata: { packname?: string; author?: string; categories?: string[] } = {}
): Promise<string> {
    const wMedia = isWebpBuffer(media) ? media : await imageToWebp(media);
    return saveWebpWithExif(wMedia, metadata);
}

export async function writeExifVid(
    media: Buffer,
    metadata: { packname?: string; author?: string; categories?: string[] } = {}
): Promise<string> {
    const wMedia = isWebpBuffer(media) ? media : await videoToWebp(media);
    return saveWebpWithExif(wMedia, metadata);
}

export async function writeExif(
    media: { data: Buffer; mimetype: string },
    metadata: { packname?: string; author?: string; categories?: string[] } = {}
): Promise<string> {
    const wMedia =
        isWebpBuffer(media.data) || /webp/.test(media.mimetype)
            ? media.data
            : /image/.test(media.mimetype) && !/gif/.test(media.mimetype)
                ? await imageToWebp(media.data)
                : /video|gif/.test(media.mimetype)
                    ? await videoToWebp(media.data)
                    : await imageToWebp(media.data);
    return saveWebpWithExif(wMedia, metadata);
}

export async function exifAvatar(
    buffer: Buffer,
    packname: string,
    author: string,
    categories: string[] = [''],
    extra: Record<string, any> = {}
): Promise<Buffer> {
    const wMedia = isWebpBuffer(buffer) ? buffer : await imageToWebp(buffer);
    const img = new webp.Image();
    await img.load(wMedia);
    img.exif = buildExifBuffer(packname, author, categories, { 'is-avatar-sticker': 1, ...extra }, PACK_ID);
    return await img.save(null);
}

export async function addExif(
    webpSticker: Buffer,
    packname: string,
    author: string,
    categories: string[] = [''],
    extra: Record<string, any> = {}
): Promise<Buffer> {
    const wMedia = isWebpBuffer(webpSticker) ? webpSticker : await imageToWebp(webpSticker);
    const img = new webp.Image();
    await img.load(wMedia);
    img.exif = buildExifBuffer(packname, author, categories, extra, randomBytes(32).toString('hex'));
    return await img.save(null);
}

export default {
    isWebpBuffer,
    isMp4Buffer,
    isGifBuffer,
    runFfmpeg,
    imageToWebp,
    videoToWebp,
    webpToPng,
    gifToMp4,
    resizeToJpeg,
    writeExifImg,
    writeExifVid,
    writeExif,
    exifAvatar,
    addExif
};
