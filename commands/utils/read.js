import { downloadContentFromMessage, getContentType } from '@whiskeysockets/baileys';
import { unwrapContent } from '#simple';

export default {
  command: ['readviewonce', 'read', 'readvo', 'ver'],
  category: 'utils',
  description: 'Revelar imagen, video o audio de ver una sola vez.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const quoted = msg.quoted;
    if (!quoted) {
      return msg.reply('《✧》 Por favor, responde a un mensaje de *ver una sola vez* para revelar su contenido.');
    }
    try {
      const unwrapped = unwrapContent(quoted.rawMessage || quoted.message || quoted);
      const messageType = getContentType(unwrapped) || quoted.type || '';
      const mediaMessage = unwrapped?.[messageType] || quoted.msg;
      if (!mediaMessage || !/image|video|ptv|audio/i.test(messageType)) {
        return msg.reply('《✧》 El mensaje citado no contiene una imagen, video o audio válido.');
      }

      const dlType = /ptv|video/i.test(messageType)
        ? 'video'
        : /image/i.test(messageType)
          ? 'image'
          : 'audio';

      // Quitar marca viewOnce antes de descargar/reenviar
      const cleanMedia = { ...mediaMessage, viewOnce: false };
      const stream = await downloadContentFromMessage(cleanMedia, dlType);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      if (!buffer.length) {
        return msg.reply('《✧》 No se pudo descargar el contenido.');
      }

      if (dlType === 'video') {
        await sock.sendMessage(
          msg.chat,
          { video: buffer, caption: mediaMessage.caption || '', mimetype: mediaMessage.mimetype || 'video/mp4' },
          { quoted: msg }
        );
      } else if (dlType === 'image') {
        await sock.sendMessage(
          msg.chat,
          { image: buffer, caption: mediaMessage.caption || '' },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          msg.chat,
          {
            audio: buffer,
            mimetype: mediaMessage.mimetype || 'audio/ogg; codecs=opus',
            ptt: Boolean(mediaMessage.ptt)
          },
          { quoted: msg }
        );
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
