import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import ff from 'fluent-ffmpeg';
import webp from 'node-webpmux';
import config from '#config';

const PACK_ID = 'https://github.com/lyanvalentinmail-prog/DenjiBot';

function tmpFile(ext: string): string {
    return path.join(tmpdir(), `denji-${randomBytes(6).toString('hex')}.${ext}`);
}

export async function imageToWebp(media: Buffer): Promise<Buffer> {
    const tmpOut = tmpFile('webp');
    const tmpIn = tmpFile('jpg');
    fs.writeFileSync(tmpIn, media);
    try {
        await new Promise((resolve, reject) => {
            ff(tmpIn)
                .on('error', reject)
                .on('end', () => resolve(true))
                .addOutputOptions([
                    '-vcodec', 'libwebp',
                    '-vf',
                    "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse"
                ])
                .toFormat('webp')
                .save(tmpOut);
        });
        return fs.readFileSync(tmpOut);
    } finally {
        if (fs.existsSync(tmpOut)) try { fs.unlinkSync(tmpOut); } catch {}
        if (fs.existsSync(tmpIn)) try { fs.unlinkSync(tmpIn); } catch {}
    }
}

export async function videoToWebp(media: Buffer): Promise<Buffer> {
    const tmpOut = tmpFile('webp');
    const tmpIn = tmpFile('mp4');
    fs.writeFileSync(tmpIn, media);
    try {
        await new Promise((resolve, reject) => {
            ff(tmpIn)
                .on('error', reject)
                .on('end', () => resolve(true))
                .addOutputOptions([
                    '-vcodec', 'libwebp',
                    '-vf',
                    "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
                    '-loop', '0',
                    '-ss', '00:00:00',
                    '-t', '00:00:08',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0'
                ])
                .toFormat('webp')
                .save(tmpOut);
        });
        return fs.readFileSync(tmpOut);
    } finally {
        if (fs.existsSync(tmpOut)) try { fs.unlinkSync(tmpOut); } catch {}
        if (fs.existsSync(tmpIn)) try { fs.unlinkSync(tmpIn); } catch {}
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
    const tmpIn = tmpFile('webp');
    const tmpOut = tmpFile('webp');
    fs.writeFileSync(tmpIn, webpData);
    const img = new webp.Image();
    img.exif = buildExifBuffer(
        metadata.packname ?? config.botName,
        metadata.author ?? config.devName,
        metadata.categories ?? ['']
    );
    await img.load(tmpIn);
    if (fs.existsSync(tmpIn)) try { fs.unlinkSync(tmpIn); } catch {}
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
    const wMedia = await imageToWebp(media);
    return saveWebpWithExif(wMedia, metadata);
}

export async function writeExifVid(
    media: Buffer,
    metadata: { packname?: string; author?: string; categories?: string[] } = {}
): Promise<string> {
    const wMedia = await videoToWebp(media);
    return saveWebpWithExif(wMedia, metadata);
}

export async function writeExif(
    media: { data: Buffer; mimetype: string },
    metadata: { packname?: string; author?: string; categories?: string[] } = {}
): Promise<string> {
    const wMedia = /webp/.test(media.mimetype)
        ? media.data
        : /image/.test(media.mimetype)
            ? await imageToWebp(media.data)
            : /video/.test(media.mimetype)
                ? await videoToWebp(media.data)
                : Buffer.alloc(0);
    return saveWebpWithExif(wMedia, metadata);
}

export async function exifAvatar(
    buffer: Buffer,
    packname: string,
    author: string,
    categories: string[] = [''],
    extra: Record<string, any> = {}
): Promise<Buffer> {
    const img = new webp.Image();
    await img.load(buffer);
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
    const img = new webp.Image();
    await img.load(webpSticker);
    img.exif = buildExifBuffer(packname, author, categories, extra, randomBytes(32).toString('hex'));
    return await img.save(null);
}

export default {
    imageToWebp,
    videoToWebp,
    writeExifImg,
    writeExifVid,
    writeExif,
    exifAvatar,
    addExif
};
