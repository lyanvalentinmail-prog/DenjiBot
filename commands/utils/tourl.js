import db from '#db';
import { uploadMedia } from '#simple';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default {
  command: ['tourl', 'upload'],
  category: 'utils',
  description: 'Convertir una imagen, video o audio en un enlace.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = (q.msg || q).mimetype || q.mime || '';
    if (!mime) {
      return sock.reply(
        msg.chat,
        `《✧》 Envía o responde a una imagen, video o audio con *${usedPrefix + command}* para convertirlo en enlace.\n\n` +
          `✿ Servidores disponibles:\n` +
          `> › catbox (permanente)\n` +
          `> › quax\n` +
          `> › uguu (temporal)\n` +
          `> › tmpfiles\n` +
          `> › auto (por defecto, con respaldo automático)`,
        msg
      );
    }
    try {
      const media = await q.download();
      if (!media?.length) return sock.reply(msg.chat, 'ꕥ No se pudo descargar el archivo.', msg);
      const preferred = args[0]?.toLowerCase() || '';
      const { url, server } = await uploadMedia(media, preferred === 'auto' ? '' : preferred);
      const user = db.getUser(msg.sender);
      const ext = mime.split('/')[1]?.split(';')[0]?.toUpperCase() || 'ARCHIVO';
      await sock.reply(
        msg.chat,
        `𖹭 ❀ *Subido a ${server}*\n\n` +
          `ׅ  ׄ  ✿   ׅ り *Link ›* ${url}\n` +
          `ׅ  ׄ  ✿   ׅ り *Peso ›* ${formatBytes(media.length)}\n` +
          `ׅ  ׄ  ✿   ׅ り *Tipo ›* ${ext}\n` +
          `ׅ  ׄ  ✿   ׅ り *Solicitado por ›* ${user?.name || msg.pushName || 'Usuario'}`,
        msg
      );
    } catch (e) {
      await sock.reply(msg.chat, `> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`, msg);
    }
  }
};
