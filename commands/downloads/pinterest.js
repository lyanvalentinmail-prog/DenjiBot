import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const PIN_URL_REGEX = /^https?:\/\/(([a-z]{2,3}|www)\.)?(pinterest\.[a-z.]+|pin\.it)\/.+/i;

async function fetchJson(url) {
  const { data } = await axios.get(url, {
    timeout: 22_000,
    headers: { 'User-Agent': DEFAULT_UA, Accept: 'application/json' }
  });
  return data;
}

async function getPinterestDownload(url) {
  const enc = encodeURIComponent(url);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    async () => {
      const res = await fetchJson(`${delirius}/download/pinterestdl?url=${enc}`);
      const d = res?.data;
      const dl = d?.download?.url || d?.video || d?.image || d?.url;
      if (!dl) return null;
      const isVideo = /video|\.mp4/i.test(`${d?.download?.type || ''} ${dl}`);
      return {
        type: isVideo ? 'video' : 'image',
        url: dl,
        title: d?.title || null,
        author: d?.author_name || d?.username || null,
        likes: d?.likes || null
      };
    },
    async () => {
      const res = await fetchJson(`${vreden}/api/v1/download/pinterest?url=${enc}`);
      const r = res?.result;
      const media = Array.isArray(r?.media) ? r.media[0] : r;
      const dl = media?.url || r?.url || r?.video || r?.image;
      if (!dl) return null;
      return {
        type: /\.mp4/i.test(dl) || /video/i.test(media?.type || '') ? 'video' : 'image',
        url: dl,
        title: r?.title || null,
        author: r?.author || null
      };
    },
    async () => {
      const res = await fetchJson(`https://api.siputzx.my.id/api/d/pinterest?url=${enc}`);
      const d = res?.data;
      const dl = d?.url || (Array.isArray(d?.media_urls) ? d.media_urls[0]?.url : null);
      if (!dl) return null;
      return {
        type: /\.mp4/i.test(dl) ? 'video' : 'image',
        url: dl,
        title: d?.title || null
      };
    },
    async () => {
      if (!yuki?.url) return null;
      const res = await fetchJson(`${yuki.url}/dl/pinterest?url=${enc}&key=${yuki.key}`);
      const d = res?.data || res?.result;
      const dl = d?.url || d?.video || d?.image;
      if (!dl) return null;
      return { type: /\.mp4/i.test(dl) ? 'video' : 'image', url: dl, title: d?.title || null };
    },
    async () => {
      const res = await fetchJson(`https://fare.ink/dl/pin?url=${enc}`);
      const d = res?.resultado;
      if (!d?.url) return null;
      const isVideo = /\.mp4/i.test(d.filename || d.url);
      return { type: isVideo ? 'video' : 'image', url: d.url, title: d.titulo || null, author: d.autor || null };
    }
  ];

  for (const fn of providers) {
    try {
      const out = await fn();
      if (out?.url && /^https?:\/\//i.test(out.url)) return out;
    } catch {}
  }
  return null;
}

async function getPinterestSearch(query) {
  const enc = encodeURIComponent(query);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    async () => {
      const res = await fetchJson(`${delirius}/search/pinterestv2?text=${enc}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      return list
        .filter(d => d?.image)
        .map(d => ({
          type: 'image',
          image: d.image,
          title: d.title || d.description || null,
          name: d.name || null,
          username: d.username || null,
          likes: d.likes || null,
          created_at: d.created_at || null
        }));
    },
    async () => {
      const res = await fetchJson(`${vreden}/api/v1/search/pinterest?query=${enc}`);
      const raw = res?.result?.search_data || res?.result;
      const list = Array.isArray(raw) ? raw : [];
      return list
        .map(d => (typeof d === 'string' ? { type: 'image', image: d } : {
          type: 'image',
          image: d?.image || d?.images_url || d?.media?.images?.orig?.url || d?.url,
          title: d?.title || d?.grid_title || null,
          username: d?.pinner?.username || d?.username || null
        }))
        .filter(d => d.image && /^https?:\/\//i.test(d.image));
    },
    async () => {
      const res = await fetchJson(`https://api.siputzx.my.id/api/s/pinterest?query=${enc}`);
      const list = Array.isArray(res?.data) ? res.data : [];
      return list
        .map(d => ({
          type: 'image',
          image: d?.images_url || d?.image || d?.pin,
          title: d?.grid_title || d?.title || null,
          created_at: d?.created_at || null,
          url: d?.pin || null
        }))
        .filter(d => d.image && /^https?:\/\//i.test(d.image));
    },
    async () => {
      if (!yuki?.url) return [];
      const res = await fetchJson(`${yuki.url}/search/pinterest?q=${enc}&key=${yuki.key}`);
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res?.results) ? res.results : [];
      return list
        .map(d => ({
          type: /\.mp4/i.test(d?.image || d?.url || '') ? 'video' : 'image',
          image: d?.image || d?.images_url || d?.descarga || d?.url,
          title: d?.title || d?.titulo || null,
          name: d?.author || d?.autor || null
        }))
        .filter(d => d.image && /^https?:\/\//i.test(d.image));
    },
    async () => {
      const res = await fetchJson(`https://fare.ink/search/pin?q=${enc}&limit=15`);
      const list = Array.isArray(res?.results) ? res.results : [];
      return list
        .filter(d => d?.descarga)
        .map(d => ({
          type: /video|\.mp4/i.test(`${d.tipo || ''} ${d.descarga}`) ? 'video' : 'image',
          image: d.descarga,
          title: d.titulo || null,
          name: d.autor || null,
          likes: d.likes || null,
          url: d.url || null
        }));
    }
  ];

  for (const fn of providers) {
    try {
      const out = await fn();
      if (Array.isArray(out) && out.length) return out;
    } catch {}
  }
  return [];
}

export default {
  command: ['pinterest', 'pin', 'pimg'],
  category: 'downloads',
  description: 'Buscar y descargar imágenes y videos de Pinterest.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const text = args.join(' ').trim();
    if (!text) {
      return msg.reply('《✧》 Por favor, ingresa un término de búsqueda o un enlace de Pinterest.');
    }

    try {
      if (PIN_URL_REGEX.test(text)) {
        const data = await getPinterestDownload(text);
        if (!data?.url) return msg.reply('ꕥ No se pudo obtener el contenido de ese enlace de Pinterest.');

        const caption =
          `ㅤ۟∩　ׅ　★　ׅ　🅟𝖨𝖭 🅓ownload　ׄᰙ\n\n` +
          (data.title ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Título* › ${data.title}\n` : '') +
          (data.author ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Autor* › ${data.author}\n` : '') +
          (data.likes ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Likes* › ${data.likes}\n` : '') +
          `𖣣ֶㅤ֯⌗ ☆  ⬭ *Enlace* › ${text}`;

        if (data.type === 'video') {
          await sock.sendMessage(
            msg.chat,
            { video: { url: data.url }, caption, mimetype: 'video/mp4', fileName: 'pinterest.mp4' },
            { quoted: msg }
          );
        } else {
          await sock.sendMessage(msg.chat, { image: { url: data.url }, caption }, { quoted: msg });
        }
        return;
      }

      const results = await getPinterestSearch(text);
      if (!results.length) {
        return msg.reply(`《✧》 No se encontraron resultados para *${text}*.`);
      }

      // Mezclar ligeramente para variedad y enviar hasta 8 resultados
      const shuffled = results.sort(() => Math.random() - 0.5).slice(0, 8);
      const medias = shuffled.map(r => ({
        type: r.type === 'video' ? 'video' : 'image',
        data: { url: r.image },
        caption:
          `ㅤ۟∩　ׅ　★　ׅ　🅟𝖨𝖭 🅢earch　ׄᰙ\n\n` +
          (r.title ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Título* › ${String(r.title).slice(0, 180)}\n` : '') +
          (r.name ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Autor* › ${r.name}\n` : '') +
          (r.username ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Usuario* › @${r.username}\n` : '') +
          (r.likes ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Likes* › ${r.likes}\n` : '') +
          (r.created_at ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Fecha* › ${r.created_at}\n` : '') +
          `𖣣ֶㅤ֯⌗ ☆  ⬭ *Búsqueda* › ${text}`
      }));

      await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg });
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
