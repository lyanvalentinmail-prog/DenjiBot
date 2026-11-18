import yts from 'yt-search';
import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const MAX_AUDIO_SIZE = 60 * 1024 * 1024;

function getVideoId(text = '') {
  const raw = String(text || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

const isYTUrl = (url = '') =>
  /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url);

function sanitizeFileName(name = 'audio') {
  return (
    String(name)
      .replace(/\.(mp3|m4a|opus|ogg|wav)$/i, '')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100) || 'audio'
  );
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

async function fetchJson(url, timeout = 22_000) {
  const { data } = await axios.get(url, {
    timeout,
    headers: { 'User-Agent': DEFAULT_UA, Accept: 'application/json' }
  });
  return data;
}

async function downloadValidAudio(downloadUrl) {
  const res = await axios.get(downloadUrl, {
    responseType: 'arraybuffer',
    timeout: 60_000,
    maxRedirects: 5,
    maxContentLength: MAX_AUDIO_SIZE,
    headers: { 'User-Agent': DEFAULT_UA, Accept: '*/*' }
  });
  const ct = String(res.headers?.['content-type'] || '').toLowerCase();
  const buf = Buffer.from(res.data);
  if (buf.length < 4096) throw new Error('Archivo de audio vacío');
  if (ct.includes('text/html') || ct.includes('application/json')) {
    throw new Error('Respuesta no es audio');
  }
  return buf;
}

function buildAudioProviders(url) {
  const enc = encodeURIComponent(url);
  const yuki = global.APIs?.yuki;
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const oota = global.APIs?.ootaizumi?.url || 'https://api.ootaizumi.web.id';
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const zenz = global.APIs?.zenzxz?.url || 'https://api.zenzxz.my.id';

  return [
    async () => {
      const d = await fetchJson(`https://api.ryuzei.xyz/download/ytmp3/v4?url=${enc}`);
      return d?.result?.download || d?.data?.download || d?.download || d?.url;
    },
    async () => {
      const d = await fetchJson(`https://api.ryuzei.xyz/download/ytmp3/v2?url=${enc}`);
      return d?.result?.download || d?.data?.download || d?.download || d?.url;
    },
    async () => {
      const d = await fetchJson(`https://api.ryuzei.xyz/download/ytmp3/v3?url=${enc}`);
      return d?.result?.download || d?.data?.download || d?.download || d?.url;
    },
    async () => {
      const d = await fetchJson(`${vreden}/api/v1/download/youtube/audio?url=${enc}&quality=128`);
      return d?.result?.download?.url || d?.result?.url || d?.data?.url;
    },
    async () => {
      const d = await fetchJson(`${delirius}/download/ytmp3?url=${enc}`);
      return d?.data?.download?.url || d?.data?.url || d?.result?.download;
    },
    async () => {
      const d = await fetchJson(`${oota}/downloader/youtube?url=${enc}&format=mp3`);
      return d?.result?.download || d?.result?.url || d?.data?.url;
    },
    async () => {
      const d = await fetchJson(`${zenz}/api/downloader/ytmp3?url=${enc}`);
      return d?.data?.download_url || d?.result?.download_url || d?.data?.url;
    },
    async () => {
      const d = await fetchJson(`https://api.siputzx.my.id/api/d/ytmp3?url=${enc}`);
      return d?.data?.dl || d?.data?.url || d?.result?.url;
    },
    async () => {
      if (!yuki?.url) return null;
      const d = await fetchJson(`${yuki.url}/dl/ytmp3?url=${enc}&key=${yuki.key}`);
      return d?.data?.dl || d?.data?.url || d?.result?.url || d?.descarga?.url;
    },
    async () => {
      const d = await fetchJson(`https://api.lempi.lat/dl/yta?url=${enc}&apikey=montekey28`);
      return d?.descarga?.url || d?.data?.url;
    }
  ];
}

async function getAudioBuffer(url) {
  for (const provider of buildAudioProviders(url)) {
    try {
      const dlUrl = await provider();
      if (!dlUrl || typeof dlUrl !== 'string' || !/^https?:\/\//i.test(dlUrl)) continue;
      const buffer = await downloadValidAudio(dlUrl);
      if (buffer?.length) return { buffer, url: dlUrl };
    } catch {}
  }
  return null;
}

export default {
  command: ['play', 'mp3', 'ytmp3', 'ytaudio', 'playaudio', 'yta'],
  category: 'downloads',
  description: 'Descargar una canción de YouTube.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const inputText = args.join(' ').trim();
      if (!inputText) {
        return msg.reply('《✧》 Por favor, menciona el nombre o URL del video que deseas descargar.');
      }

      const videoId = getVideoId(inputText);
      const query = videoId ? `https://www.youtube.com/watch?v=${videoId}` : inputText;

      let url = videoId ? query : isYTUrl(inputText) ? inputText : '';
      let title = 'audio';
      let thumbnail = null;

      const videoInfo = await getVideoInfo(query, videoId).catch(() => null);
      if (videoInfo) {
        url = videoInfo.url || (videoInfo.videoId ? `https://www.youtube.com/watch?v=${videoInfo.videoId}` : url);
        title = videoInfo.title || title;
        thumbnail = videoInfo.image || videoInfo.thumbnail || null;

        const views = Number(videoInfo.views || 0).toLocaleString('es-HN');
        const channel = videoInfo.author?.name || videoInfo.author || 'Desconocido';
        const infoMessage =
          `➩ Descargando › *${title}*\n\n` +
          `> ❖ Canal › *${channel}*\n` +
          `> ⴵ Duración › *${videoInfo.timestamp || 'Desconocido'}*\n` +
          `> ❀ Vistas › *${views}*\n` +
          `> ✩ Publicado › *${videoInfo.ago || 'Desconocido'}*\n` +
          `> ❒ Enlace › *${url}*`;

        if (thumbnail) {
          await sock.sendMessage(msg.chat, { image: { url: thumbnail }, caption: infoMessage }, { quoted: msg })
            .catch(() => msg.reply(infoMessage));
        } else {
          await msg.reply(infoMessage);
        }
      }

      if (!url || !isYTUrl(url)) {
        return msg.reply('《✧》 No se encontró un video válido de YouTube.');
      }

      const audio = await getAudioBuffer(url);
      if (!audio?.buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar el *audio* en este momento. Intenta con otro video o más tarde.');
      }

      const fileName = `${sanitizeFileName(title)}.mp3`;
      if (audio.buffer.length > 45 * 1024 * 1024) {
        await sock.sendMessage(
          msg.chat,
          { document: audio.buffer, fileName, mimetype: 'audio/mpeg' },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          msg.chat,
          { audio: audio.buffer, fileName, mimetype: 'audio/mpeg' },
          { quoted: msg }
        );
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
