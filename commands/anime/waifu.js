import axios from 'axios';
import { getBuffer } from '#simple';

async function fetchAnimeImage(type) {
  const tag = type === 'neko' ? 'neko' : 'waifu';
  const providers = [
    async () => {
      const { data } = await axios.get(`https://nekos.best/api/v2/${tag}`, { timeout: 12_000 });
      return data?.results?.[0]?.url || null;
    },
    async () => {
      const { data } = await axios.get(`https://api.waifu.pics/sfw/${tag}`, { timeout: 12_000 });
      return data?.url || null;
    },
    async () => {
      const { data } = await axios.get('https://api.waifu.im/search?is_nsfw=false&included_tags=waifu', { timeout: 12_000 });
      return data?.images?.[0]?.url || null;
    }
  ];

  for (const fn of providers) {
    try {
      const url = await fn();
      if (url && /^https?:\/\//i.test(url)) {
        const buf = await getBuffer(url, { timeout: 18_000 });
        if (buf?.length > 500) return buf;
      }
    } catch {}
  }
  return null;
}

export default {
  command: ['waifu', 'neko'],
  category: 'anime',
  description: 'Obtener una imagen de waifu o neko aleatoria.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    try {
      const img = await fetchAnimeImage(command.toLowerCase());
      if (!img) {
        return msg.reply('《✧》 No se pudo obtener la imagen en este momento. Intenta de nuevo.');
      }
      await sock.sendMessage(
        msg.chat,
        { image: img, caption: `✿ ¡Aquí tienes tu *${command.toUpperCase()}*!` },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
