import axios from 'axios';
import db from '#db';

const QUOTE_ENDPOINTS = [
  'https://bot.lyo.su/quote/generate',
  'https://qc.botcahx.eu.org/generate'
];

export default {
  command: ['qc', 'quotely'],
  category: 'stickers',
  description: 'Crear un sticker con texto estilo quote.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const textFinal = (args.join(' ') || msg.quoted?.text || '').trim();
      if (!textFinal) {
        return sock.reply(msg.chat, '《✧》 Ingresa un texto o responde a un mensaje para crear el sticker.', msg);
      }
      if (textFinal.length > 150) {
        return sock.reply(msg.chat, '《✧》 El texto no puede tener más de 150 caracteres.', msg);
      }

      const target = msg.quoted && !args.length ? msg.quoted.sender : msg.sender;
      const pp = await sock.profilePictureUrl(target, 'image').catch(() => null);
      const userGlobal = db.getUser(target);
      const nombre = userGlobal?.name || (target === msg.sender ? msg.pushName : '') || target.split('@')[0];

      const quoteObj = {
        type: 'quote',
        format: 'png',
        backgroundColor: '#000000',
        width: 512,
        height: 768,
        scale: 2,
        messages: [
          {
            entities: [],
            avatar: true,
            from: {
              id: 1,
              name: nombre,
              ...(pp ? { photo: { url: pp } } : {})
            },
            text: textFinal,
            replyMessage: {}
          }
        ]
      };

      let buffer = null;
      for (const endpoint of QUOTE_ENDPOINTS) {
        try {
          const { data } = await axios.post(endpoint, quoteObj, {
            timeout: 20_000,
            headers: { 'Content-Type': 'application/json' }
          });
          const b64 = data?.result?.image;
          if (b64) {
            buffer = Buffer.from(b64, 'base64');
            if (buffer.length > 500) break;
          }
        } catch {}
      }

      if (!buffer?.length) {
        return sock.reply(msg.chat, '《✧》 No se pudo generar el sticker quote en este momento.', msg);
      }

      const user = db.getUser(msg.sender);
      const name = user?.name || msg.pushName || msg.sender.split('@')[0];
      const meta1 = user?.metadatos ? String(user.metadatos).trim() : '';
      const meta2 = user?.metadatos2 ? String(user.metadatos2).trim() : '';
      const packname = meta1 || global.botName || 'Denji bot';
      const author = meta1 ? meta2 : `@${name}`;

      await sock.sendImageAsSticker(msg.chat, buffer, msg, { packname, author });
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
