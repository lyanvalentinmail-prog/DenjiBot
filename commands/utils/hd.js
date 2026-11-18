import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import exif from '#core/exif';
import { uploadMedia, getBuffer, DEFAULT_UA } from '#simple';

const { webpToPng, runFfmpeg } = exif;

async function enhanceViaVectorInk(buffer) {
  const res = await fetch('https://us-central1-vector-ink.cloudfunctions.net/upscaleImage', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: '*/*',
      origin: 'https://vectorink.io',
      referer: 'https://vectorink.io/',
      'user-agent': DEFAULT_UA
    },
    body: JSON.stringify({ data: { image: buffer.toString('base64') } }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!res.ok) return null;
  const json = await res.json();
  const inner = typeof json?.result === 'string' ? JSON.parse(json.result) : json?.result;
  const b64 = inner?.image?.b64_json;
  if (!b64) return null;
  const raw = Buffer.from(b64, 'base64');
  if (raw.length < 500) return null;
  const ft = await fileTypeFromBuffer(raw).catch(() => null);
  return ft?.mime === 'image/webp' ? await webpToPng(raw) : raw;
}

async function enhanceViaApis(buffer) {
  const uploaded = await uploadMedia(buffer).catch(() => null);
  if (!uploaded?.url) return null;
  const enc = encodeURIComponent(uploaded.url);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const endpoints = [
    `${vreden}/api/v1/artificial/remini?url=${enc}&pixel=4`,
    `${delirius}/tools/hd?url=${enc}`,
    `https://api.siputzx.my.id/api/iloveimg/upscale?image=${enc}&scale=2`,
    `https://api.ryuzei.xyz/tools/remini?url=${enc}`,
    ...(yuki?.url ? [`${yuki.url}/tools/hd?url=${enc}&key=${yuki.key}`] : [])
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 40_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ct = String(res.headers?.['content-type'] || '').toLowerCase();
      const raw = Buffer.from(res.data);
      if (ct.includes('application/json')) {
        const j = JSON.parse(raw.toString('utf8'));
        const imgUrl = j?.result?.url || j?.data?.url || j?.url || (typeof j?.result === 'string' ? j.result : null) || (typeof j?.data === 'string' ? j.data : null);
        if (imgUrl && /^https?:\/\//i.test(imgUrl)) {
          const dl = await getBuffer(imgUrl, { timeout: 30_000 });
          if (dl?.length > 1000) return dl;
        }
        continue;
      }
      if (ct.startsWith('image/') && raw.length > 1000) return raw;
    } catch {}
  }
  return null;
}

async function enhanceLocalFfmpeg(buffer) {
  const tag = crypto.randomBytes(6).toString('hex');
  const inFile = path.join(os.tmpdir(), `denji-hd-in-${tag}.img`);
  const outFile = path.join(os.tmpdir(), `denji-hd-out-${tag}.jpg`);
  fs.writeFileSync(inFile, buffer);
  try {
    await runFfmpeg([
      '-y', '-i', inFile, '-frames:v', '1',
      '-vf', "scale='min(2048,iw*2)':'min(2048,ih*2)':flags=lanczos,unsharp=5:5:0.85:5:5:0.0",
      '-q:v', '2', outFile
    ]);
    return fs.readFileSync(outFile);
  } finally {
    try { if (fs.existsSync(inFile)) fs.unlinkSync(inFile); } catch {}
    try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch {}
  }
}

export default {
  command: ['hd', 'enhance', 'remini', 'upscale'],
  category: 'utils',
  description: 'Mejorar la calidad de una imagen.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    try {
      const q = msg.quoted || msg;
      const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
      if (!mime || !/^image\/(jpe?g|png|webp)$/i.test(mime)) {
        return msg.reply(`《✧》 Envía o responde a una *imagen* con *${usedPrefix + command}*.`);
      }
      const buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar la imagen.');
      }

      const enhanced =
        (await enhanceViaApis(buffer).catch(() => null)) ||
        (await enhanceViaVectorInk(buffer).catch(() => null)) ||
        (await enhanceLocalFfmpeg(buffer).catch(() => null));

      if (!enhanced?.length) {
        return msg.reply('《✧》 No se pudo mejorar la imagen en este momento.');
      }

      await sock.sendMessage(
        msg.chat,
        { image: enhanced, caption: '✿ *Imagen mejorada con éxito*' },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
