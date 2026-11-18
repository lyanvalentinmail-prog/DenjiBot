import axios from 'axios';
import db from '#db';
import { splitGraphemes, getBuffer, DEFAULT_UA } from '#simple';

async function fetchEmojiMixBuffer(e1, e2) {
  const cp = emoji =>
    Array.from(emoji)
      .map(ch => `u${ch.codePointAt(0).toString(16).toLowerCase()}`)
      .join('-');

  const providers = [
    // 1. Tenor Emoji Kitchen v2 (media_formats.png_transparent.url)
    async () => {
      const url =
        `https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ` +
        `&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5` +
        `&q=${encodeURIComponent(e1)}_${encodeURIComponent(e2)}`;
      const { data } = await axios.get(url, { timeout: 15_000, headers: { 'User-Agent': DEFAULT_UA } });
      const first = data?.results?.[0];
      const pngUrl =
        first?.media_formats?.png_transparent?.url ||
        first?.media_formats?.webp_transparent?.url ||
        first?.media_formats?.png?.url;
      if (!pngUrl) return null;
      return getBuffer(pngUrl, { timeout: 15_000 });
    },
    // 2. EmojiKitchen API pública
    async () => {
      const url = `https://emojik.vercel.app/s/${encodeURIComponent(e1)}_${encodeURIComponent(e2)}?size=512`;
      const buf = await getBuffer(url, { timeout: 15_000 });
      return buf?.length > 500 ? buf : null;
    },
    // 3. Google Gstatic Emoji Kitchen directo (fechas más comunes)
    async () => {
      const a = cp(e1);
      const b = cp(e2);
      const dates = ['20201001', '20210218', '20210521', '20220815', '20230418', '20231113', '20240206'];
      for (const d of dates) {
        for (const [x, y] of [[a, b], [b, a]]) {
          try {
            const buf = await getBuffer(
              `https://www.gstatic.com/android/keyboard/emojikitchen/${d}/${x}/${x}_${y}.png`,
              { timeout: 6_000 }
            );
            if (buf?.length > 500) return buf;
          } catch {}
        }
      }
      return null;
    }
  ];

  for (const fn of providers) {
    try {
      const buf = await fn();
      if (buf?.length > 500) return buf;
    } catch {}
  }
  return null;
}

export default {
  command: ['emojimix', 'emix'],
  category: 'stickers',
  description: 'Mezclar dos emojis en un sticker.',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    try {
      const raw = String(text || '').trim();
      if (!raw) {
        return msg.reply(`《✧》 Ingresa 2 emojis para combinar.\n> Ejemplo: *${usedPrefix + command}* 👻+👀`);
      }

      let emoji1 = '';
      let emoji2 = '';
      if (raw.includes('+')) {
        const parts = raw.split('+').map(s => s.trim()).filter(Boolean);
        emoji1 = parts[0] || '';
        emoji2 = parts[1] || '';
      } else {
        const graphemes = splitGraphemes(raw).filter(g => g.trim());
        emoji1 = graphemes[0] || '';
        emoji2 = graphemes[1] || '';
      }

      if (!emoji1 || !emoji2) {
        return msg.reply(`《✧》 Debes indicar dos emojis separados por *+*.\n> Ejemplo: *${usedPrefix + command}* 👻+👀`);
      }

      const user = db.getUser(msg.sender);
      const name = user?.name || msg.pushName || msg.sender.split('@')[0];
      const meta1 = user?.metadatos ? String(user.metadatos).trim() : '';
      const meta2 = user?.metadatos2 ? String(user.metadatos2).trim() : '';
      const packname = meta1 || global.botName || 'Denji bot';
      const author = meta1 ? meta2 : `@${name}`;

      const buffer = await fetchEmojiMixBuffer(emoji1, emoji2);
      if (!buffer) {
        return msg.reply(`《✧》 No existe una combinación para *${emoji1} + ${emoji2}*. Prueba con otros emojis.`);
      }

      await sock.sendImageAsSticker(msg.chat, buffer, msg, { packname, author });
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
