import fs from 'node:fs';
import exif from '#core/exif';
import db from '#db';

const { writeExif } = exif;

export default {
  command: ['wm', 'take', 'robarsticker'],
  category: 'stickers',
  description: 'Cambiar el paquete y autor de un sticker citado.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
    if (!/webp|sticker/i.test(mime) && q?.mtype !== 'stickerMessage' && q?.type !== 'stickerMessage') {
      return msg.reply(
        `《✧》 Responde a un *sticker* con *${usedPrefix + command} <paquete> | <autor>*.\n` +
        `> Si no escribes texto, usará tu nombre o los metadatos de *${usedPrefix}setmeta*.`
      );
    }

    try {
      const buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar el sticker.');
      }

      const raw = args.join(' ').trim();
      const userData = db.getUser(msg.sender) || {};
      const fallbackPack = userData.metadatos || msg.pushName || 'DenjiBot';
      const fallbackAuthor = userData.metadatos2 ?? '';

      let packname = fallbackPack;
      let author = fallbackAuthor;

      if (raw) {
        const sep = raw.search(/[|•/]/);
        if (sep === -1) {
          packname = raw.trim();
          author = '';
        } else {
          packname = raw.slice(0, sep).trim();
          author = raw.slice(sep + 1).trim();
        }
      }

      const outPath = await writeExif(
        { mimetype: 'image/webp', data: buffer },
        { packname, author, categories: ['✨'] }
      );
      try {
        const signed = fs.readFileSync(outPath);
        await sock.sendMessage(msg.chat, { sticker: signed }, { quoted: msg });
      } finally {
        try { if (outPath && fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
