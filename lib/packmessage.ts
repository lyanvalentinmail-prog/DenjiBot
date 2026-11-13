import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import {
    generateWAMessageFromContent,
    getMediaKeys,
    MEDIA_HKDF_KEY_MAPPING,
    MEDIA_PATH_MAP,
    proto
} from '@whiskeysockets/baileys';

/*
 * Envío de un paquete de stickers nativo de WhatsApp (stickerPackMessage).
 *
 * Baileys todavía no lo incluye, así que aquí se hace a mano lo mismo que hace
 * WhatsApp: un ZIP sin comprimir con los stickers y el icono, cifrado como
 * cualquier otro archivo multimedia, más una miniatura cifrada con la misma clave.
 */

export type PackSticker = {
    /** Sticker en WebP de 512x512. */
    webp: Buffer;
    animated?: boolean;
    emojis?: string[];
};

export type PackInput = {
    name: string;
    publisher: string;
    description?: string;
    stickers: PackSticker[];
    /** Icono del paquete: PNG de 96x96. */
    trayPng: Buffer;
    /** Miniatura del mensaje: JPEG de 252x252. */
    thumbnailJpeg: Buffer;
};

const PACK_MEDIA = 'sticker-pack';
const THUMB_MEDIA = 'thumbnail-sticker-pack';
const UPLOAD_TIMEOUT_MS = 90_000;

// Baileys solo conoce los tipos de archivo que él mismo envía; estos dos son los
// que usa WhatsApp para los paquetes. Si una versión futura ya los trae, se respetan.
function registerMediaTypes(): void {
    const paths = MEDIA_PATH_MAP as Record<string, string>;
    const keys = MEDIA_HKDF_KEY_MAPPING as Record<string, string>;
    paths[PACK_MEDIA] ??= '/mms/sticker-pack';
    paths[THUMB_MEDIA] ??= '/mms/thumbnail-sticker-pack';
    keys[PACK_MEDIA] ??= 'Sticker Pack';
    keys[THUMB_MEDIA] ??= 'Sticker Pack Thumbnail';
}

const sha256 = (data: Buffer): Buffer => crypto.createHash('sha256').update(data).digest();

/** Nombre de un sticker dentro del ZIP: su SHA-256 en base64, sin barras. */
export function stickerFileName(webp: Buffer): string {
    return sha256(webp).toString('base64').replace(/\//g, '-') + '.webp';
}

/** ZIP sin compresión (método "store"): es lo que espera WhatsApp y no necesita dependencias. */
export function zipStore(files: { name: string; data: Buffer }[]): Buffer {
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    const chunks: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
        const name = Buffer.from(file.name, 'utf8');
        const crc = zlib.crc32(file.data) >>> 0;
        const size = file.data.length;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(dosTime, 10);
        local.writeUInt16LE(dosDate, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(size, 18);
        local.writeUInt32LE(size, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);

        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50, 0);
        entry.writeUInt16LE(20, 4);
        entry.writeUInt16LE(20, 6);
        entry.writeUInt16LE(0x0800, 8);
        entry.writeUInt16LE(0, 10);
        entry.writeUInt16LE(dosTime, 12);
        entry.writeUInt16LE(dosDate, 14);
        entry.writeUInt32LE(crc, 16);
        entry.writeUInt32LE(size, 20);
        entry.writeUInt32LE(size, 24);
        entry.writeUInt16LE(name.length, 28);
        entry.writeUInt32LE(offset, 42);

        chunks.push(local, name, file.data);
        central.push(entry, name);
        offset += local.length + name.length + size;
    }

    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...chunks, directory, end]);
}

/** Cifrado multimedia de WhatsApp: AES-256-CBC + los 10 primeros bytes de un HMAC-SHA256. */
export async function encryptMedia(data: Buffer, mediaType: string, mediaKey: Buffer = crypto.randomBytes(32)) {
    registerMediaTypes();
    const { iv, cipherKey, macKey } = await getMediaKeys(mediaKey, mediaType as any) as { iv: Buffer; cipherKey: Buffer; macKey: Buffer };
    const aes = crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
    const encrypted = Buffer.concat([aes.update(data), aes.final()]);
    const mac = crypto.createHmac('sha256', macKey).update(iv).update(encrypted).digest().subarray(0, 10);
    const body = Buffer.concat([encrypted, mac]);

    return {
        mediaKey,
        body,
        fileSha256: sha256(data),
        fileEncSha256: sha256(body),
        fileLength: data.length
    };
}

async function upload(sock: any, data: Buffer, mediaType: string, mediaKey?: Buffer) {
    const encrypted = await encryptMedia(data, mediaType, mediaKey);
    const tmpFile = path.join(os.tmpdir(), `denji-${mediaType}-${crypto.randomBytes(6).toString('hex')}.enc`);
    await fs.promises.writeFile(tmpFile, encrypted.body);

    try {
        const result = await sock.waUploadToServer(tmpFile, {
            mediaType,
            fileEncSha256B64: encrypted.fileEncSha256.toString('base64'),
            timeoutMs: UPLOAD_TIMEOUT_MS
        });
        if (!result?.directPath) throw new Error('WhatsApp no devolvió la ruta del archivo subido');
        return { ...encrypted, directPath: result.directPath as string };
    } finally {
        await fs.promises.unlink(tmpFile).catch(() => {});
    }
}

/** Construye el ZIP del paquete y la lista de stickers (sin duplicados). */
export function buildPackArchive(input: PackInput, packId: string) {
    const files: { name: string; data: Buffer }[] = [];
    const stickers: proto.Message.StickerPackMessage.ISticker[] = [];
    const seen = new Set<string>();

    for (const sticker of input.stickers) {
        const fileName = stickerFileName(sticker.webp);
        if (seen.has(fileName)) continue;
        seen.add(fileName);

        files.push({ name: fileName, data: sticker.webp });
        stickers.push({
            fileName,
            isAnimated: !!sticker.animated,
            emojis: sticker.emojis?.length ? sticker.emojis : [''],
            accessibilityLabel: '',
            isLottie: false,
            mimetype: 'image/webp'
        });
    }

    const trayIconFileName = `${packId}.png`;
    files.push({ name: trayIconFileName, data: input.trayPng });

    return { zip: zipStore(files), stickers, trayIconFileName };
}

/**
 * Sube el paquete y lo envía al chat. Devuelve cuántos stickers lleva.
 * Lanza un error si la subida o el envío fallan.
 */
export async function sendStickerPack(sock: any, jid: string, input: PackInput, quoted?: any): Promise<number> {
    if (!input.stickers.length) throw new Error('El paquete no tiene stickers');

    const packId = crypto.randomUUID();
    const { zip, stickers, trayIconFileName } = buildPackArchive(input, packId);

    const pack = await upload(sock, zip, PACK_MEDIA);
    // La miniatura se cifra con la misma clave que el paquete: así la encuentra WhatsApp.
    const thumb = await upload(sock, input.thumbnailJpeg, THUMB_MEDIA, pack.mediaKey);

    const stickerPackMessage: proto.Message.IStickerPackMessage = {
        stickerPackId: packId,
        name: input.name,
        publisher: input.publisher,
        packDescription: input.description || '',
        stickers,
        fileLength: pack.fileLength,
        fileSha256: pack.fileSha256,
        fileEncSha256: pack.fileEncSha256,
        mediaKey: pack.mediaKey,
        directPath: pack.directPath,
        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
        trayIconFileName,
        thumbnailDirectPath: thumb.directPath,
        thumbnailSha256: thumb.fileSha256,
        thumbnailEncSha256: thumb.fileEncSha256,
        thumbnailHeight: 252,
        thumbnailWidth: 252,
        imageDataHash: sha256(input.thumbnailJpeg).toString('base64'),
        stickerPackSize: zip.length,
        stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.USER_CREATED
    };

    const message = generateWAMessageFromContent(jid, { stickerPackMessage }, {
        userJid: sock.user?.id,
        quoted
    } as any);

    await sock.relayMessage(jid, message.message!, {
        messageId: message.key.id!,
        // Baileys no reconoce este tipo de mensaje y lo marcaría como texto.
        additionalAttributes: { type: 'media' }
    });

    return stickers.length;
}
