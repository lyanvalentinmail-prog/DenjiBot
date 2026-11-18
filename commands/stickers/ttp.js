import fs from 'node:fs';
import axios from 'axios';
import exif from '#core/exif';
import db from '#db';
import config from '#config';
import { DEFAULT_UA } from '#simple';

const { writeExifImg, writeExifVid, isWebpBuffer } = exif;

async function fetchTextSticker(text, animated) {
  const enc = encodeURIComponent(text);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';

  const urls = animated
    ? [
        `https://api.siputzx.my.id/api/m/attp?text=${enc}`,
        `${delirius}/canvas/attp?text=${enc}`,
        `${vreden}/api/attp?text=${enc}`,
        `https://api.erdwpe.com/api/maker/attp?text=${enc}`
      ]
    : [
        `https://api.siputzx.my.id/api/m/ttp?text=${enc}`,
        `${delirius}/canvas/ttp?text=${enc}`,
        `${vreden}/api/ttp?text=${enc}`,
        `https://api.erdwpe.com/api/maker/ttp?text=${enc}`
      ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 25_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ct = String(res.headers?.['content-type'] || '').toLowerCase();
      const raw = Buffer.from(res.data);
      if (raw.length > 500 && (ct.startsWith('image/') || ct.startsWith('video/') || isWebpBuffer(raw))) {
        return { buffer: raw, mime: ct };
      }
    } catch {}
  }
  return null;
}

export default {
  command: ['ttp', 'attp'],
  category: 'stickers',
  description: 'Crear un sticker de texto transparente o animado arcoíris.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const raw = args.join(' ').trim() || String(msg.quoted?.text || msg.quoted?.caption || '').trim();
    if (!raw) {
      return msg.reply(
        `《✧》 Escribe el texto para convertir en sticker.\n` +
        `> Ejemplo: *${usedPrefix + command} ¡Hola grupo!*`
      );
    }

    const clean = raw.slice(0, 120);
    const animated = command === 'attp';

    try {
      const res = await fetchTextSticker(clean, animated);
      if (!res?.buffer?.length) {
        return msg.reply('《✧》 No se pudo generar el sticker de texto en este momento.');
      }

      const userData = db.getUser(msg.sender) || {};
      const meta = {
        packname: userData.metadatos || config.botName || 'DenjiBot',
        author: userData.metadatos2 ?? (config.devName || ''),
        categories: ['✨']
      };

      const isAnim = animated || /gif|mp4|video/i.test(res.mime) || res.buffer.indexOf(Buffer.from('ANIM')) !== -1;
      const outPath = isAnim
        ? await writeExifVid(res.buffer, meta)
        : await writeExifImg(res.buffer, meta);

      try {
        await sock.sendMessage(msg.chat, { sticker: fs.readFileSync(outPath) }, { quoted: msg });
      } finally {
        try { if (outPath && fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
