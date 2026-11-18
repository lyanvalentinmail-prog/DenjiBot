import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const IG_REGEX = /https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/(p|reel|reels|tv|stories|share)\/\S+/i;

async function fetchJson(url) {
  const { data } = await axios.get(url, {
    timeout: 22_000,
    headers: { 'User-Agent': DEFAULT_UA, Accept: 'application/json' }
  });
  return data;
}

function guessType(item) {
  const t = String(item?.type || item?.mime || '').toLowerCase();
  const u = String(item?.url || '');
  if (t.includes('video') || /\.mp4(\?|$)/i.test(u)) return 'video';
  return 'image';
}

async function getInstagramMedia(url) {
  const enc = encodeURIComponent(url);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    async () => {
      const res = await fetchJson(`${delirius}/download/instagram?url=${enc}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      return list.filter(x => x?.url).map(x => ({ url: x.url, type: guessType(x) }));
    },
    async () => {
      const res = await fetchJson(`${delirius}/download/instagramv2?url=${enc}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      return list.filter(x => x?.url).map(x => ({ url: x.url, type: guessType(x) }));
    },
    async () => {
      const res = await fetchJson(`${vreden}/api/v1/download/instagram?url=${enc}`);
      const list = Array.isArray(res?.result?.data) ? res.result.data : Array.isArray(res?.result) ? res.result : [];
      return list.filter(x => x?.url).map(x => ({ url: x.url, type: guessType(x) }));
    },
    async () => {
      const res = await fetchJson(`https://api.siputzx.my.id/api/d/igdl?url=${enc}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      return list.filter(x => x?.url).map(x => ({ url: x.url, type: guessType(x) }));
    },
    async () => {
      const res = await fetchJson(`https://api.ryuzei.xyz/download/instagram?url=${enc}`);
      const raw = res?.result || res?.data;
      const list = Array.isArray(raw) ? raw : raw?.url ? [raw] : [];
      return list.filter(x => x?.url).map(x => ({ url: x.url, type: guessType(x) }));
    },
    async () => {
      if (!yuki?.url) return [];
      const res = await fetchJson(`${yuki.url}/dl/instagram?url=${enc}&key=${yuki.key}`);
      const raw = res?.data?.result || res?.data || res?.result;
      const list = Array.isArray(raw) ? raw : raw?.url ? [raw] : [];
      return list.filter(x => x?.url).map(x => ({ url: x.url, type: guessType(x) }));
    }
  ];

  for (const fn of providers) {
    try {
      const items = await fn();
      if (Array.isArray(items) && items.length) {
        const seen = new Set();
        return items.filter(it => {
          if (!it.url || seen.has(it.url)) return false;
          seen.add(it.url);
          return true;
        });
      }
    } catch {}
  }
  return [];
}

export default {
  command: ['instagram', 'ig', 'igdl'],
  category: 'downloads',
  description: 'Descargar fotos, videos y reels de Instagram.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const raw = args.join(' ').trim();
    if (!raw) {
      return msg.reply('《✧》 Por favor, ingresa un enlace de Instagram.');
    }
    const url = raw.match(IG_REGEX)?.[0] || (raw.includes('instagram.com/') ? raw.split(/\s+/)[0] : '');
    if (!url) {
      return msg.reply('《✧》 El enlace no parece válido. Asegúrate de que sea una publicación o reel de Instagram.');
    }
    try {
      const items = await getInstagramMedia(url);
      if (!items.length) {
        return msg.reply('《✧》 No se pudo obtener el contenido de Instagram. Verifica que la publicación sea pública.');
      }
      const caption = `ㅤ۟∩　ׅ　★ ໌　ׅ　🅘𝗇𝗌𝗍𝖺𝗀𝗋𝖺𝗆 🅓ownload　ׄᰙ\n\n𖣣ֶㅤ֯⌗ ❀  ⬭ *Enlace* › ${url}`;
      if (items.length === 1) {
        const item = items[0];
        if (item.type === 'video') {
          await sock.sendMessage(
            msg.chat,
            { video: { url: item.url }, mimetype: 'video/mp4', caption },
            { quoted: msg }
          );
        } else {
          await sock.sendMessage(msg.chat, { image: { url: item.url }, caption }, { quoted: msg });
        }
      } else {
        const medias = items.slice(0, 10).map((it, idx) => ({
          type: it.type === 'video' ? 'video' : 'image',
          data: { url: it.url },
          ...(idx === 0 ? { caption } : {})
        }));
        await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg });
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
