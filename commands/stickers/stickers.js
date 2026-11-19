import db from '#db';
import { searchPacks, getPackFromUrl, isStickerlyUrl, stickerlyUrlOf } from '#stickerly';

export default {
  command: ['stickerpack', 'spack', 'stickers'],
  category: 'stickers',
  description: 'Buscar y enviar packs de stickers de Sticker.ly.',
  run: async ({ msg, sock, text, usedPrefix, command }) => {
    try {
      const query = String(text || '').trim();
      if (!query) {
        return sock.reply(
          msg.chat,
          `《✧》 Ingresa un texto para buscar packs de stickers o una URL de sticker.ly.\n> Ejemplo: *${usedPrefix}${command} gatos*`,
          msg
        );
      }
      const name = db.getUser(msg.sender)?.name || msg.pushName || msg.sender.split('@')[0];

      let packData = null;
      let failures = 0;
      let responded = false;
      if (isStickerlyUrl(query)) {
        const url = stickerlyUrlOf(query);
        packData = url ? await getPackFromUrl(url) : null;
        if (!packData) failures = 1;
        responded = Boolean(packData);
      } else {
        const result = await searchPacks(query);
        failures = result.failures;
        responded = result.responded;
        if (result.packs.length) {
          packData = result.packs[Math.floor(Math.random() * Math.min(result.packs.length, 6))];
        }
      }

      if (!packData?.stickers?.length) {
        const reason =
          !responded && failures > 0 && !isStickerlyUrl(query)
            ? 'La búsqueda de stickers no responde en este momento. Intenta de nuevo más tarde.'
            : isStickerlyUrl(query)
              ? 'No se pudo obtener ese paquete. Revisa que la URL sea correcta.'
              : `No se encontraron packs de stickers para *${query}*.`;
        return sock.reply(msg.chat, `《✧》 ${reason}`, msg);
      }

      const stickerResults = packData.stickers.slice(0, 30).map(s => ({
        url: s.url,
        isAnimated: Boolean(s.isAnimated),
        isLottie: false,
        emojis: ['🎭']
      }));

      try {
        await sock.sendStickerPackMessage(
          msg.chat,
          {
            name: packData.name || query,
            publisher: packData.author || `@${name}`,
            description: global.botName || 'Denji bot',
            stickers: stickerResults
          },
          msg
        );
        return;
      } catch (packError) {
        console.error('[spack] No se pudo enviar el paquete nativo:', packError);
        // Respaldo: enviar los primeros stickers individualmente si falla el paquete.
        let sent = 0;
        for (const s of stickerResults.slice(0, 8)) {
          try {
            await sock.sendImageAsSticker(msg.chat, s.url, msg, {
              packname: packData.name || query,
              author: packData.author || `@${name}`
            });
            sent += 1;
          } catch {}
        }
        if (sent > 0) {
          return sock.reply(
            msg.chat,
            `《✧》 No se pudo enviar el paquete completo, así que te envié ${sent} stickers sueltos del pack *${packData.name || query}*.`,
            msg
          );
        }
        throw packError;
      }
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
