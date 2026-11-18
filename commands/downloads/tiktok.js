import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const isTikTokUrl = (s = '') =>
  /https?:\/\/((www|m|vm|vt|lite)\.)?tiktok\.com\/.+/i.test(String(s).trim());

async function fetchJson(url, options = {}) {
  const { data } = await axios({
    url,
    method: options.method || 'GET',
    data: options.data,
    timeout: 22_000,
    headers: { 'User-Agent': DEFAULT_UA, Accept: 'application/json', ...(options.headers || {}) }
  });
  return data;
}

function fixTikwmUrl(u) {
  if (!u || typeof u !== 'string') return '';
  if (u.startsWith('http')) return u;
  return `https://www.tikwm.com${u.startsWith('/') ? '' : '/'}${u}`;
}

async function downloadTikTok(url) {
  const enc = encodeURIComponent(url);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    // 1. TikWM oficial (video HD + slides de imágenes)
    async () => {
      const res = await fetchJson(`https://www.tikwm.com/api/?url=${enc}&hd=1`);
      const d = res?.data;
      if (!d) return null;
      const images = Array.isArray(d.images) ? d.images.map(fixTikwmUrl).filter(Boolean) : [];
      const videoUrl = fixTikwmUrl(d.hdplay || d.play || d.wmplay);
      if (!images.length && !videoUrl) return null;
      return {
        type: images.length ? 'image' : 'video',
        title: d.title || 'Sin descripción',
        author: d.author?.nickname || d.author?.unique_id || 'Desconocido',
        views: d.play_count,
        likes: d.digg_count,
        comments: d.comment_count,
        shares: d.share_count,
        duration: d.duration ? `${d.duration}s` : null,
        url: videoUrl,
        images
      };
    },
    // 2. Delirius (video + slides)
    async () => {
      const res = await fetchJson(`${delirius}/download/tiktok?url=${enc}`);
      const d = res?.data;
      const media = d?.meta?.media?.[0];
      if (!media) return null;
      if (media.type === 'image' && Array.isArray(media.images) && media.images.length) {
        return {
          type: 'image',
          title: d.title || 'Sin descripción',
          author: d.author?.nickname || d.author?.username || 'Desconocido',
          views: d.repro,
          likes: d.like,
          comments: d.comment,
          shares: d.share,
          images: media.images
        };
      }
      const videoUrl = media.org || media.hd || media.wm;
      if (!videoUrl) return null;
      return {
        type: 'video',
        title: d.title || 'Sin descripción',
        author: d.author?.nickname || d.author?.username || 'Desconocido',
        views: d.repro,
        likes: d.like,
        comments: d.comment,
        shares: d.share,
        duration: d.duration ? `${d.duration}s` : null,
        url: videoUrl,
        images: []
      };
    },
    // 3. Starlights
    async () => {
      const res = await fetchJson(`https://api.starlights.uk/api/download/tiktok?url=${enc}`);
      const d = res?.data || res?.result;
      const videoUrl = d?.nowm || d?.hd || d?.video || d?.url;
      const images = Array.isArray(d?.images) ? d.images : [];
      if (!videoUrl && !images.length) return null;
      return {
        type: images.length ? 'image' : 'video',
        title: d?.title || 'Sin descripción',
        author: d?.author?.nickname || d?.creator || d?.author || 'Desconocido',
        views: d?.views,
        likes: d?.likes,
        comments: d?.comments,
        url: videoUrl,
        images
      };
    },
    // 4. Vreden
    async () => {
      const res = await fetchJson(`${vreden}/api/v1/download/tiktok?url=${enc}`);
      const d = res?.result;
      if (!d) return null;
      const list = Array.isArray(d.data) ? d.data : [];
      const photos = list.filter(x => x.type === 'photo' && x.url).map(x => x.url);
      const vid =
        list.find(x => x.type === 'nowatermark_hd')?.url ||
        list.find(x => x.type === 'nowatermark')?.url ||
        list.find(x => x.url)?.url;
      if (!photos.length && !vid) return null;
      return {
        type: photos.length ? 'image' : 'video',
        title: d.title || 'Sin descripción',
        author: d.author?.nickname || d.author?.fullname || 'Desconocido',
        views: d.stats?.views,
        likes: d.stats?.likes,
        comments: d.stats?.comment,
        shares: d.stats?.share,
        duration: d.durations || d.duration || null,
        url: vid,
        images: photos
      };
    },
    // 5. Yuki API
    async () => {
      if (!yuki?.url) return null;
      const res = await fetchJson(`${yuki.url}/download/tiktok?url=${enc}&key=${yuki.key}`);
      const d = res?.data || res?.result;
      if (!d) return null;
      const images = Array.isArray(d.images) ? d.images : [];
      const videoUrl = d.hdplay || d.play || d.video || d.url;
      if (!images.length && !videoUrl) return null;
      return {
        type: images.length ? 'image' : 'video',
        title: d.title || 'Sin descripción',
        author: d.author?.nickname || d.author || 'Desconocido',
        views: d.play_count || d.views,
        likes: d.digg_count || d.likes,
        url: videoUrl,
        images
      };
    }
  ];

  for (const fn of providers) {
    try {
      const out = await fn();
      if (out) return out;
    } catch {}
  }
  return null;
}

async function searchTikTok(query) {
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const yuki = global.APIs?.yuki;

  const providers = [
    async () => {
      const body = new URLSearchParams({ keywords: query, count: '12', cursor: '0', hd: '1' });
      const res = await fetchJson('https://www.tikwm.com/api/feed/search', {
        method: 'POST',
        data: body.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const vids = res?.data?.videos;
      if (!Array.isArray(vids) || !vids.length) return [];
      return vids
        .map(v => ({
          title: v.title || query,
          author: v.author?.nickname || v.author?.unique_id || 'Desconocido',
          url: fixTikwmUrl(v.play || v.hdplay || v.wmplay),
          likes: v.digg_count,
          views: v.play_count
        }))
        .filter(v => v.url);
    },
    async () => {
      const res = await fetchJson(`${delirius}/search/tiktoksearch?query=${encodeURIComponent(query)}`);
      const list = res?.meta || res?.data;
      if (!Array.isArray(list) || !list.length) return [];
      return list
        .map(v => ({
          title: v.title || query,
          author: v.author?.nickname || v.author?.username || 'Desconocido',
          url: v.hd || v.play || v.video || v.url,
          likes: v.like,
          views: v.play_count || v.repro
        }))
        .filter(v => v.url);
    },
    async () => {
      if (!yuki?.url) return [];
      const res = await fetchJson(
        `${yuki.url}/search/tiktok?query=${encodeURIComponent(query)}&limit=10&key=${yuki.key}`
      );
      const list = res?.data || res?.results;
      if (!Array.isArray(list) || !list.length) return [];
      return list
        .map(v => ({
          title: v.title || query,
          author: v.author?.nickname || v.author || 'Desconocido',
          url: v.play || v.video || v.url,
          likes: v.digg_count || v.likes,
          views: v.play_count || v.views
        }))
        .filter(v => v.url);
    }
  ];

  for (const fn of providers) {
    try {
      const out = await fn();
      if (out?.length) return out;
    } catch {}
  }
  return [];
}

function formatCaption(d, label = '🅣𝗂𝗄𝖳𝗈𝗄 🅓ownload') {
  const lines = [`ㅤ۟∩　ׅ　★ ໌　ׅ　${label}　ׄᰙ\n`];
  if (d.title) lines.push(`𖣣ֶㅤ֯⌗ ❀  ⬭ *Título* › ${String(d.title).slice(0, 300)}`);
  if (d.author) lines.push(`𖣣ֶㅤ֯⌗ ❀  ⬭ *Autor* › ${d.author}`);
  if (d.duration) lines.push(`𖣣ֶㅤ֯⌗ ❀  ⬭ *Duración* › ${d.duration}`);
  if (d.views != null) lines.push(`𖣣ֶㅤ֯⌗ ❀  ⬭ *Vistas* › ${Number(d.views).toLocaleString('es-ES')}`);
  if (d.likes != null) lines.push(`𖣣ֶㅤ֯⌗ ❀  ⬭ *Likes* › ${Number(d.likes).toLocaleString('es-ES')}`);
  if (d.comments != null) lines.push(`𖣣ֶㅤ֯⌗ ❀  ⬭ *Comentarios* › ${Number(d.comments).toLocaleString('es-ES')}`);
  return lines.join('\n');
}

export default {
  command: ['tiktok', 'tt', 'tiktoks', 'tts'],
  category: 'downloads',
  description: 'Buscar o descargar videos/imágenes de TikTok.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return msg.reply('《✧》 Por favor, ingresa un enlace o término de búsqueda de TikTok.');
    }
    try {
      const linkMatch = query.match(/https?:\/\/((www|m|vm|vt|lite)\.)?tiktok\.com\/\S+/i)?.[0];
      if (linkMatch || isTikTokUrl(query)) {
        const targetUrl = linkMatch || query;
        const data = await downloadTikTok(targetUrl);
        if (!data) {
          return msg.reply('《✧》 No se pudo descargar el contenido de TikTok. Verifica el enlace o intenta más tarde.');
        }
        const caption = formatCaption(data);
        if (data.type === 'image' && data.images?.length) {
          const medias = data.images.slice(0, 12).map((imgUrl, idx) => ({
            type: 'image',
            data: { url: imgUrl },
            ...(idx === 0 ? { caption } : {})
          }));
          await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg });
        } else {
          await sock.sendMessage(
            msg.chat,
            { video: { url: data.url }, mimetype: 'video/mp4', caption },
            { quoted: msg }
          );
        }
        return;
      }

      const results = await searchTikTok(query);
      if (!results.length) {
        return msg.reply(`《✧》 No se encontraron resultados en TikTok para *${query}*.`);
      }
      const picked = results.slice(0, 5);
      if (picked.length === 1) {
        await sock.sendMessage(
          msg.chat,
          { video: { url: picked[0].url }, mimetype: 'video/mp4', caption: formatCaption(picked[0], '🅣𝗂𝗄𝖳𝗈𝗄 🅢earch') },
          { quoted: msg }
        );
      } else {
        const medias = picked.map(r => ({
          type: 'video',
          data: { url: r.url },
          caption: formatCaption(r, '🅣𝗂𝗄𝖳𝗈𝗄 🅢earch')
        }));
        await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg });
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
