import fs from 'node:fs';
import crypto from 'node:crypto';
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import exif from '#core/exif';
import db from '#db';
import config from '#config';
import { uploadMedia, getBuffer, DEFAULT_UA } from '#simple';

const { webpToPng, writeExifImg } = exif;

async function prepareInput(buffer) {
  const ft = await fileTypeFromBuffer(buffer).catch(() => null);
  if (ft?.mime === 'image/webp') {
    const png = await webpToPng(buffer);
    return { buffer: png, mime: 'image/png', ext: 'png' };
  }
  const mime = ft?.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  return { buffer, mime, ext: mime === 'image/png' ? 'png' : 'jpg' };
}

async function removeBgPixelcut(buffer) {
  const { buffer: img, mime, ext } = await prepareInput(buffer);
  const form = new FormData();
  form.append('image', new Blob([img], { type: mime }), `photo_${Date.now()}.${ext}`);
  form.append('format', 'png');
  form.append('model', 'v1');

  const res = await fetch('https://api2.pixelcut.app/image/matte/v1', {
    method: 'POST',
    headers: {
      accept: 'image/png,application/json,*/*',
      'x-client-version': 'web',
      'x-locale': 'en',
      'user-agent': DEFAULT_UA
    },
    body: form,
    signal: AbortSignal.timeout(40_000)
  });
  if (!res.ok) return null;
  const ct = String(res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    const j = await res.json().catch(() => null);
    if (j?.result_url) return getBuffer(j.result_url, { timeout: 30_000 });
    return null;
  }
  const out = Buffer.from(await res.arrayBuffer());
  return out.length > 500 ? out : null;
}

async function removeBgPxPic(buffer) {
  const { buffer: img, mime, ext } = await prepareInput(buffer);
  const fileName = `${crypto.randomBytes(5).toString('hex')}.${ext}`;
  const sign = await axios.post(
    'https://pxpic.com/getSignedUrl',
    { folder: 'uploads', fileName },
    { headers: { 'Content-Type': 'application/json', 'User-Agent': DEFAULT_UA }, timeout: 20_000 }
  );
  if (!sign.data?.presignedUrl) return null;
  await axios.put(sign.data.presignedUrl, img, { headers: { 'Content-Type': mime }, timeout: 30_000 });

  const body = new URLSearchParams({
    imageUrl: `https://files.fotoenhancer.com/uploads/${fileName}`,
    targetFormat: 'png',
    needCompress: 'no',
    imageQuality: '100',
    compressLevel: '6',
    fileOriginalExtension: ext,
    aiFunction: 'removebg',
    upscalingLevel: ''
  }).toString();

  const { data } = await axios.post('https://pxpic.com/callAiFunction', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': DEFAULT_UA },
    timeout: 40_000
  });
  const url = data?.resultImageUrl || data?.result?.imageUrl;
  return url && /^https?:\/\//i.test(url) ? getBuffer(url, { timeout: 30_000 }) : null;
}

async function removeBgApis(buffer) {
  const { buffer: img } = await prepareInput(buffer);
  const uploaded = await uploadMedia(img).catch(() => null);
  if (!uploaded?.url) return null;
  const enc = encodeURIComponent(uploaded.url);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const endpoints = [
    `https://api.siputzx.my.id/api/iloveimg/removebg?image=${enc}`,
    `${delirius}/tools/removebg?url=${enc}`,
    `${vreden}/api/v1/artificial/removebg?url=${enc}`,
    ...(yuki?.url ? [`${yuki.url}/tools/removebg?method=url&url=${enc}&key=${yuki.key}`] : [])
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 35_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ct = String(res.headers?.['content-type'] || '').toLowerCase();
      const raw = Buffer.from(res.data);
      if (ct.includes('application/json')) {
        const j = JSON.parse(raw.toString('utf8'));
        const u = j?.data?.url || j?.result?.url || j?.url || (typeof j?.data === 'string' ? j.data : null);
        if (u && /^https?:\/\//i.test(u)) {
          const dl = await getBuffer(u, { timeout: 25_000 });
          if (dl?.length > 500) return dl;
        }
        continue;
      }
      if (ct.startsWith('image/') && raw.length > 500) return raw;
    } catch {}
  }
  return null;
}

export default {
  command: ['removebg', 'rmbg', 'sinfondo', 'nobg'],
  category: 'utils',
  description: 'Quitar el fondo de una imagen (PNG transparente o sticker).',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
    if (!mime || !/^image\/(jpe?g|png|webp)$/i.test(mime)) {
      return msg.reply(
        `《✧》 Envía o responde a una *imagen* con *${usedPrefix + command}*.\n` +
        `> Añade *sticker* para recibirla como sticker sin fondo.`
      );
    }

    try {
      const buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar la imagen.');
      }

      const result =
        (await removeBgPixelcut(buffer).catch(() => null)) ||
        (await removeBgPxPic(buffer).catch(() => null)) ||
        (await removeBgApis(buffer).catch(() => null));

      if (!result?.length) {
        return msg.reply(
          '《✧》 No se pudo quitar el fondo en este momento.\n' +
          '> También puedes hacerlo gratis en *https://bigger.pics/tools/remove-background*.'
        );
      }

      const wantsSticker = args.some(a => /^(s|sticker|stiker)$/i.test(a));
      if (wantsSticker) {
        const userData = db.getUser(msg.sender) || {};
        const out = await writeExifImg(result, {
          packname: userData.metadatos || config.botName || 'DenjiBot',
          author: userData.metadatos2 ?? (config.devName || ''),
          categories: ['✂️']
        });
        try {
          return await sock.sendMessage(msg.chat, { sticker: fs.readFileSync(out) }, { quoted: msg });
        } finally {
          try { if (out && fs.existsSync(out)) fs.unlinkSync(out); } catch {}
        }
      }

      await sock.sendMessage(
        msg.chat,
        {
          document: result,
          mimetype: 'image/png',
          fileName: `sin_fondo_${Date.now()}.png`,
          caption: '✿ *Fondo eliminado con éxito* (PNG transparente)'
        },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
