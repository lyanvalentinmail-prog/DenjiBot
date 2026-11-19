import { findSingleSticker, isStickerlyUrl } from '#stickerly';

export default {
  command: ['ssearch', 'stickersearch'],
  category: 'stickers',
  description: 'Buscar un sticker por texto y enviarlo.',
  run: async ({ msg, sock, text, usedPrefix, command }) => {
    try {
      const query = String(text || '').trim();
      if (!query) {
        return sock.reply(
          msg.chat,
          `《✧》 Especifica qué sticker quieres buscar.\n> Ejemplo: *${usedPrefix}${command} gatos*`,
          msg
        );
      }

      const { sticker, failures, responded } = await findSingleSticker(query);
      if (!sticker?.url) {
        const reason =
          !responded && failures > 0 && !isStickerlyUrl(query)
            ? 'No pude buscar stickers ahora mismo (la búsqueda no responde). Intenta de nuevo más tarde.'
            : `No se encontraron stickers para *${query}*.`;
        return sock.reply(msg.chat, `《✧》 ${reason}`, msg);
      }

      try {
        await sock.sendImageAsSticker(msg.chat, sticker.url, msg, {
          packname: sticker.packName || 'Denji bot',
          author: sticker.author || global.botName || 'Denji bot'
        });
        return;
      } catch (sendError) {
        console.error('[ssearch] No se pudo enviar como sticker:', sendError);
        // Respaldo: enviarlo como imagen para que al menos llegue algo.
        try {
          await sock.sendMessage(
            msg.chat,
            {
              image: { url: sticker.url },
              caption: `《✧》 Sticker de *${sticker.packName || query}* (${sticker.author || 'Sticker.ly'})`
            },
            { quoted: msg }
          );
          return;
        } catch {
          throw sendError;
        }
      }
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
