import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const TW_REGEX = /https?:\/\/(www\.|mobile\.)?(twitter|x|vxtwitter|fxtwitter)\.com\/([^/\s]+)\/status\/(\d+)/i;

async function fetchJson(url) {
  const { data } = await axios.get(url, {
    timeout: 20_000,
    headers: { 'User-Agent': DEFAULT_UA, Accept: 'application/json' }
  });
  return data;
}

async function getTwitterMedia(url, user, statusId) {
  const cleanUrl = `https://x.com/${user}/status/${statusId}`;
  const enc = encodeURIComponent(cleanUrl);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    // 1. vxtwitter API pública directa (muy estable, soporta videos y fotos múltiples)
    async () => {
      const res = await fetchJson(`https://api.vxtwitter.com/${user}/status/${statusId}`);
      const list = Array.isArray(res?.media_extended) ? res.media_extended : [];
      if (!list.length) return null;
      return {
        title: res.text || null,
        author: res.user_name ? `${res.user_name} (@${res.user_screen_name})` : null,
        date: res.date || null,
        likes: res.likes ?? null,
        comments: res.replies ?? null,
        retweets: res.retweets ?? null,
        medias: list
          .filter(m => m?.url)
          .map(m => ({ type: m.type === 'video' || m.type === 'gif' ? 'video' : 'image', url: m.url }))
      };
    },
    // 2. fxtwitter API pública directa
    async () => {
      const res = await fetchJson(`https://api.fxtwitter.com/${user}/status/${statusId}`);
      const t = res?.tweet;
      const list = Array.isArray(t?.media?.all) ? t.media.all : [];
      if (!list.length) return null;
      return {
        title: t.text || null,
        author: t.author?.name ? `${t.author.name} (@${t.author.screen_name})` : null,
        date: t.created_at || null,
        likes: t.likes ?? null,
        comments: t.replies ?? null,
        retweets: t.retweets ?? null,
        views: t.views ?? null,
        medias: list
          .filter(m => m?.url)
          .map(m => ({ type: m.type === 'video' || m.type === 'gif' ? 'video' : 'image', url: m.url }))
      };
    },
    // 3. Delirius
    async () => {
      const res = await fetchJson(`${delirius}/download/twitterdl?url=${enc}`);
      if (!res?.found || !res?.media?.length) return null;
      return {
        title: res.info?.text || null,
        author: res.info?.user_name || res.info?.user_screen_name || null,
        date: res.info?.date || null,
        likes: res.info?.likes ?? null,
        comments: res.info?.replies ?? null,
        retweets: res.info?.retweets ?? null,
        medias: res.media
          .filter(m => m?.url)
          .map(m => ({ type: res.type === 'image' ? 'image' : 'video', url: m.url }))
      };
    },
    // 4. Vreden
    async () => {
      const res = await fetchJson(`${vreden}/api/v1/download/twitter?url=${enc}`);
      const list = Array.isArray(res?.result?.media) ? res.result.media : [];
      if (!list.length) return null;
      return {
        title: res.result?.description || res.result?.title || null,
        author: res.result?.author || null,
        medias: list
          .filter(m => m?.url)
          .map(m => ({ type: /video|\.mp4/i.test(`${m.type || ''} ${m.url}`) ? 'video' : 'image', url: m.url }))
      };
    },
    // 5. Yuki
    async () => {
      if (!yuki?.url) return null;
      const res = await fetchJson(`${yuki.url}/dl/twitter?url=${enc}&key=${yuki.key}`);
      const list = res?.data?.result;
      if (!Array.isArray(list) || !list.length) return null;
      const best = list[0];
      if (!best?.url) return null;
      return {
        title: res.data.title || null,
        medias: [{ type: res.data.type === 'image' ? 'image' : 'video', url: best.url }]
      };
    }
  ];

  for (const fn of providers) {
    try {
      const out = await fn();
      if (out?.medias?.length) return out;
    } catch {}
  }
  return null;
}

export default {
  command: ['twitter', 'x', 'xdl'],
  category: 'downloads',
  description: 'Descargar un video o imagen de Twitter/X.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const raw = args.join(' ').trim();
    if (!raw) {
      return msg.reply('《✧》 Por favor, ingresa un enlace de Twitter/X.');
    }
    const m = raw.match(TW_REGEX);
    if (!m) {
      return msg.reply('《✧》 El enlace no parece válido. Asegúrate de que sea un post de Twitter/X.');
    }
    try {
      const data = await getTwitterMedia(m[0], m[3], m[4]);
      if (!data?.medias?.length) {
        return msg.reply('《✧》 No se pudo obtener contenido multimedia de ese post.');
      }
      const caption =
        `ㅤ۟∩　ׅ　★ ໌　ׅ　🅣witter 🅓ownload　ׄᰙ\n\n` +
        (data.title ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Texto* › ${String(data.title).slice(0, 280)}\n` : '') +
        (data.author ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Autor* › ${data.author}\n` : '') +
        (data.date ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Fecha* › ${data.date}\n` : '') +
        (data.views != null ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Vistas* › ${Number(data.views).toLocaleString('es-ES')}\n` : '') +
        (data.likes != null ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Likes* › ${Number(data.likes).toLocaleString('es-ES')}\n` : '') +
        (data.retweets != null ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Retweets* › ${Number(data.retweets).toLocaleString('es-ES')}\n` : '') +
        `𖣣ֶㅤ֯⌗ ❀  ⬭ *Enlace* › ${m[0]}`;

      if (data.medias.length === 1) {
        const item = data.medias[0];
        if (item.type === 'video') {
          await sock.sendMessage(
            msg.chat,
            { video: { url: item.url }, caption, mimetype: 'video/mp4', fileName: 'twitter.mp4' },
            { quoted: msg }
          );
        } else {
          await sock.sendMessage(msg.chat, { image: { url: item.url }, caption }, { quoted: msg });
        }
      } else {
        const album = data.medias.slice(0, 10).map((it, idx) => ({
          type: it.type,
          data: { url: it.url },
          ...(idx === 0 ? { caption } : {})
        }));
        await sock.sendAlbumMessage(msg.chat, album, { quoted: msg });
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
