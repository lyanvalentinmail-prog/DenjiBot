import fs from 'node:fs';
import exif from '#core/exif';
import db from '#db';
import config from '#config';
import { uploadMedia, getBuffer } from '#simple';

const { writeExifImg, webpToPng } = exif;

function encodeMemeText(s = '') {
  const clean = String(s || '').trim();
  if (!clean) return '_';
  return encodeURIComponent(
    clean
      .replace(/-/g, '--')
      .replace(/_/g, '__')
      .replace(/\s+/g, '_')
      .replace(/\?/g, '~q')
      .replace(/&/g, '~a')
      .replace(/%/g, '~p')
      .replace(/#/g, '~h')
      .replace(/\//g, '~s')
      .replace(/\\/g, '~b')
      .replace(/"/g, "''")
  );
}

export default {
  command: ['smeme', 'stickermeme'],
  category: 'stickers',
  description: 'Crear un sticker meme con texto superior e inferior.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
    const raw = args.join(' ').trim();

    if (!mime || !/^image\/(jpe?g|png|webp)$/i.test(mime) || !raw) {
      return msg.reply(
        `《✧》 Responde o envía una imagen con el texto del meme.\n` +
        `> Ejemplo: *${usedPrefix + command} Texto arriba | Texto abajo*\n` +
        `> Solo abajo: *${usedPrefix + command} | Cuando compila a la primera*`
      );
    }

    try {
      let buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar la imagen.');
      }
      if (/webp/i.test(mime)) {
        buffer = await webpToPng(buffer);
      }

      const uploaded = await uploadMedia(buffer);
      if (!uploaded?.url) {
        return msg.reply('《✧》 No se pudo subir la imagen para generar el meme.');
      }

      let top = '';
      let bottom = '';
      if (raw.includes('|')) {
        const [a, ...rest] = raw.split('|');
        top = a.trim();
        bottom = rest.join('|').trim();
      } else {
        bottom = raw;
      }

      const memeUrl =
        `https://api.memegen.link/images/custom/${encodeMemeText(top)}/${encodeMemeText(bottom)}.png` +
        `?background=${encodeURIComponent(uploaded.url)}`;

      const memeBuf = await getBuffer(memeUrl, { timeout: 35_000 });
      if (!memeBuf?.length) {
        return msg.reply('《✧》 No se pudo generar el sticker meme.');
      }

      const userData = db.getUser(msg.sender) || {};
      const packname = userData.metadatos || config.botName || 'DenjiBot';
      const author = userData.metadatos2 ?? (config.devName || '');

      const outPath = await writeExifImg(memeBuf, { packname, author, categories: ['😂'] });
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
