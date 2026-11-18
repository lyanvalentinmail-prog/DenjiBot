import yts from 'yt-search';
import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const MAX_INLINE_VIDEO = 50 * 1024 * 1024;

function getVideoId(text = '') {
  const raw = String(text || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  return (
    raw.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|[?&]v=)([a-zA-Z0-9_-]{11})/
    )?.[1] || null
  );
}

const isYTUrl = (url = '') =>
  /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url);

function sanitizeFileName(name = 'video') {
  return (
    String(name)
      .replace(/\.(mp4|mkv|webm|mov|avi)$/i, '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100) || 'video'
  );
}

function formatBytes(bytes) {
  if (!bytes || !Number.isFinite(bytes)) return null;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

async function getVideoInfo(input, videoId) {
  if (videoId) {
    try {
      const info = await yts({ videoId });
      if (info?.videoId) {
        return {
          ...info,
          url: `https://www.youtube.com/watch?v=${info.videoId}`,
          image: info.thumbnail || info.image
        };
      }
    } catch {}
  }
  const search = await yts(input);
  return search?.videos?.[0] || search?.all?.find(v => v.type === 'video') || null;
}

async function fetchJson(url, timeout = 25_000) {
  const { data } = await axios.get(url, {
    timeout,
    headers: { 'User-Agent': DEFAULT_UA, Accept: 'application/json' }
  });
  return data;
}

async function probeSize(url) {
  try {
    const head = await axios.head(url, {
      timeout: 8_000,
      maxRedirects: 5,
      headers: { 'User-Agent': DEFAULT_UA }
    });
    const ct = String(head.headers?.['content-type'] || '').toLowerCase();
    if (ct.includes('text/html') || ct.includes('application/json')) return { valid: false, size: null };
    const len = Number(head.headers?.['content-length']);
    return { valid: true, size: Number.isFinite(len) && len > 0 ? len : null };
  } catch {
    return { valid: true, size: null };
  }
}

function buildVideoProviders(url) {
  const enc = encodeURIComponent(url);
  const yuki = global.APIs?.yuki;
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const oota = global.APIs?.ootaizumi?.url || 'https://api.ootaizumi.web.id';
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const zenz = global.APIs?.zenzxz?.url || 'https://api.zenzxz.my.id';

  return [
    async () => {
      const d = await fetchJson(`https://api.ryuzei.xyz/download/ytvideo?url=${enc}&quality=360`);
      const dl = d?.result?.download || d?.data?.download || d?.download || d?.url;
      return dl ? { url: dl, quality: d?.result?.quality || '360p', title: d?.result?.title } : null;
    },
    async () => {
      const d = await fetchJson(`${vreden}/api/v1/download/youtube/video?url=${enc}&quality=360`);
      const dl = d?.result?.download?.url || d?.result?.url || d?.data?.url;
      return dl ? { url: dl, quality: d?.result?.download?.quality || '360p', title: d?.result?.metadata?.title } : null;
    },
    async () => {
      const d = await fetchJson(`${delirius}/download/ytmp4?url=${enc}`);
      const dl = d?.data?.download?.url || d?.data?.url || d?.result?.download;
      return dl ? { url: dl, quality: d?.data?.download?.quality || '360p', title: d?.data?.title } : null;
    },
    async () => {
      const d = await fetchJson(`${oota}/downloader/youtube?url=${enc}&format=360`);
      const dl = d?.result?.download || d?.result?.url || d?.data?.url;
      return dl ? { url: dl, quality: '360p', title: d?.result?.title } : null;
    },
    async () => {
      const d = await fetchJson(`${zenz}/api/downloader/ytmp4?url=${enc}`);
      const dl = d?.data?.download_url || d?.result?.download_url || d?.data?.url;
      return dl ? { url: dl, quality: d?.data?.quality || '360p', title: d?.data?.title } : null;
    },
    async () => {
      const d = await fetchJson(`https://api.siputzx.my.id/api/d/ytmp4?url=${enc}`);
      const dl = d?.data?.dl || d?.data?.url || d?.result?.url;
      return dl ? { url: dl, quality: '360p', title: d?.data?.title } : null;
    },
    async () => {
      if (!yuki?.url) return null;
      const d = await fetchJson(`${yuki.url}/dl/ytmp4?url=${enc}&key=${yuki.key}`);
      const dl = d?.data?.dl || d?.data?.url || d?.result?.url || d?.descarga?.url;
      return dl ? { url: dl, quality: d?.data?.quality || '360p', title: d?.data?.title } : null;
    },
    async () => {
      const d = await fetchJson(`https://api.lempi.lat/dl/ytv?url=${enc}&apikey=montekey28`);
      const dl = d?.descarga?.url;
      return dl ? { url: dl, quality: d?.descarga?.calidad || '360p', title: d?.titulo } : null;
    }
  ];
}

async function getVideoDownload(url) {
  for (const provider of buildVideoProviders(url)) {
    try {
      const item = await provider();
      if (!item?.url || !/^https?:\/\//i.test(item.url)) continue;
      const probe = await probeSize(item.url);
      if (!probe.valid) continue;
      return { ...item, sizeBytes: probe.size };
    } catch {}
  }
  return null;
}

export default {
  command: ['play2', 'mp4', 'ytmp4', 'ytvideo', 'playvideo', 'ytv'],
  category: 'downloads',
  description: 'Descargar un vídeo de YouTube.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const input = args.join(' ').trim();
      if (!input) {
        return msg.reply('《✧》 Por favor, menciona el nombre o URL del video que deseas descargar.');
      }

      const videoId = getVideoId(input);
      const query = videoId ? `https://www.youtube.com/watch?v=${videoId}` : input;
      const info = await getVideoInfo(query, videoId).catch(() => null);
      const url = info?.url || (videoId ? query : isYTUrl(input) ? input : '');

      if (!url || !isYTUrl(url)) {
        return msg.reply('《✧》 No se encontró un video válido de YouTube.');
      }

      const dl = await getVideoDownload(url);
      if (!dl?.url) {
        return msg.reply('《✧》 No se pudo descargar el *video* en este momento. Intenta con otro video o más tarde.');
      }

      const title = info?.title || dl.title || 'video';
      const channel = info?.author?.name || info?.author || 'Desconocido';
      const duration = info?.timestamp || 'Desconocido';
      const views = Number(info?.views || 0).toLocaleString('es-HN');
      const thumbnail = info?.image || info?.thumbnail || null;
      const quality = dl.quality || '360p';
      const sizeText = formatBytes(dl.sizeBytes) || 'Desconocido';
      const fileName = `${sanitizeFileName(title)}.mp4`;

      const infoMessage =
        `➩ Descargando › *${title}*\n\n` +
        `> ❖ Canal › *${channel}*\n` +
        `> ⴵ Duración › *${duration}*\n` +
        `> ❀ Vistas › *${views}*\n` +
        `> ❒ Calidad › *${quality}*\n` +
        `> ❒ Tamaño › *${sizeText}*\n` +
        `> ❒ Enlace › *${url}*`;

      if (thumbnail) {
        await sock.sendMessage(msg.chat, { image: { url: thumbnail }, caption: infoMessage }, { quoted: msg })
          .catch(() => msg.reply(infoMessage));
      } else {
        await msg.reply(infoMessage);
      }

      const caption = `乂 *${title}*\n\n> ❒ Calidad › *${quality}*\n> ❒ Tamaño › *${sizeText}*`;
      const asDocument = Boolean(dl.sizeBytes && dl.sizeBytes > MAX_INLINE_VIDEO);

      if (asDocument) {
        await sock.sendMessage(
          msg.chat,
          { document: { url: dl.url }, mimetype: 'video/mp4', fileName, caption },
          { quoted: msg }
        );
        return;
      }

      try {
        await sock.sendMessage(
          msg.chat,
          { video: { url: dl.url }, mimetype: 'video/mp4', fileName, caption },
          { quoted: msg }
        );
      } catch {
        await sock.sendMessage(
          msg.chat,
          { document: { url: dl.url }, mimetype: 'video/mp4', fileName, caption },
          { quoted: msg }
        );
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
