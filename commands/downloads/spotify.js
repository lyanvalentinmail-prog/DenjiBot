import axios from 'axios';
import { getBuffer, DEFAULT_UA } from '#simple';

const MAX_AUDIO_SIZE = 60 * 1024 * 1024;
const SPOTIFY_URL_RE = /^https?:\/\/(?:open\.)?spotify\.com\/(?:intl-[a-z-]+\/)?track\/([a-zA-Z0-9]+)/i;

const cleanName = (s = 'spotify') =>
  String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'spotify';

async function searchSpotify(query) {
  const q = encodeURIComponent(query);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const sources = [
    async () => {
      const { data } = await axios.get(`${delirius}/search/spotify?q=${q}&limit=5`, {
        timeout: 18_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const item = data?.data?.[0] || data?.result?.[0];
      if (!item?.url) return null;
      return {
        title: item.title || item.name || query,
        artist: item.artist || item.artists || 'Desconocido',
        album: item.album || '',
        duration: item.duration || '',
        image: item.image || item.thumbnail || item.cover || '',
        url: item.url
      };
    },
    async () => {
      const { data } = await axios.get(`${vreden}/api/spotifysearch?query=${q}`, {
        timeout: 18_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const item = data?.result?.[0] || data?.data?.[0];
      if (!item?.url && !item?.link) return null;
      return {
        title: item.title || item.name || query,
        artist: item.artist || item.artists || 'Desconocido',
        album: item.album || '',
        duration: item.duration || '',
        image: item.image || item.thumbnail || item.cover || '',
        url: item.url || item.link
      };
    },
    async () => {
      const { data } = await axios.get(`https://api.siputzx.my.id/api/s/spotify?query=${q}`, {
        timeout: 18_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const item = data?.data?.[0];
      if (!item?.track_url && !item?.url) return null;
      return {
        title: item.title || item.name || query,
        artist: item.artist || 'Desconocido',
        album: item.album || '',
        duration: item.duration || '',
        image: item.thumbnail || item.image || '',
        url: item.track_url || item.url
      };
    },
    async () => {
      if (!yuki?.url) return null;
      const { data } = await axios.get(`${yuki.url}/search/spotify?query=${q}&key=${yuki.key}`, {
        timeout: 18_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const item = data?.data?.[0];
      if (!item?.url) return null;
      return {
        title: item.title || item.name || query,
        artist: item.artist || 'Desconocido',
        album: item.album || '',
        duration: item.duration || '',
        image: item.image || item.cover || '',
        url: item.url
      };
    }
  ];

  for (const fn of sources) {
    try {
      const res = await fn();
      if (res?.url) return res;
    } catch {}
  }
  return null;
}

async function downloadSpotifyTrack(trackUrl) {
  const enc = encodeURIComponent(trackUrl);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    async () => {
      const { data } = await axios.get(`${delirius}/download/spotifydl?url=${enc}`, {
        timeout: 35_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.data || data?.result;
      const dl = d?.url || d?.download || d?.dl;
      if (!dl) return null;
      return {
        dl,
        title: d.title || d.name,
        artist: d.author || d.artist,
        album: d.album,
        duration: d.duration,
        image: d.image || d.thumbnail || d.cover
      };
    },
    async () => {
      const { data } = await axios.get(`${vreden}/api/spotify?url=${enc}`, {
        timeout: 35_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.result || data?.data;
      const dl = d?.music || d?.download || d?.url || d?.dl;
      if (!dl) return null;
      return {
        dl,
        title: d.title || d.name,
        artist: d.artists || d.artist,
        album: d.album,
        duration: d.duration,
        image: d.cover || d.image || d.thumbnail
      };
    },
    async () => {
      const { data } = await axios.get(`https://api.siputzx.my.id/api/d/spotify?url=${enc}`, {
        timeout: 35_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.data;
      const dl = d?.download || d?.mp3DownloadLink || d?.url;
      if (!dl) return null;
      return {
        dl,
        title: d.title || d.songTitle,
        artist: d.artis || d.artist,
        album: d.album,
        duration: d.durasi || d.duration,
        image: d.image || d.coverImage
      };
    },
    async () => {
      if (!yuki?.url) return null;
      const { data } = await axios.get(`${yuki.url}/dl/spotify?url=${enc}&key=${yuki.key}`, {
        timeout: 35_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.data;
      const dl = d?.dl || d?.download || d?.url;
      if (!dl) return null;
      return {
        dl,
        title: d.title || d.name,
        artist: d.artist,
        album: d.album,
        duration: d.duration,
        image: d.image || d.cover
      };
    }
  ];

  for (const fn of providers) {
    try {
      const info = await fn();
      if (info?.dl && /^https?:\/\//i.test(info.dl)) return info;
    } catch {}
  }
  return null;
}

export default {
  command: ['spotify', 'sp', 'spotifydl'],
  category: 'downloads',
  description: 'Buscar y descargar canciones de Spotify.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return msg.reply(
        `《✧》 Escribe el nombre o enlace de una canción de Spotify.\n` +
        `> Ejemplo: *${usedPrefix + command} Kenshi Yonezu KICK BACK*`
      );
    }

    try {
      let meta = null;
      let trackUrl = '';

      if (SPOTIFY_URL_RE.test(query)) {
        trackUrl = query.split('?')[0];
      } else {
        meta = await searchSpotify(query);
        if (!meta?.url) {
          return msg.reply(`《✧》 No se encontraron resultados en Spotify para *${query}*.`);
        }
        trackUrl = meta.url;
      }

      const downloaded = await downloadSpotifyTrack(trackUrl);
      if (!downloaded?.dl) {
        return msg.reply('《✧》 No se pudo descargar la pista de Spotify en este momento.');
      }

      const title = downloaded.title || meta?.title || 'Canción';
      const artist = downloaded.artist || meta?.artist || 'Desconocido';
      const album = downloaded.album || meta?.album || '';
      const duration = downloaded.duration || meta?.duration || '';
      const cover = downloaded.image || meta?.image || '';

      const audioBuf = await getBuffer(downloaded.dl, { timeout: 55_000 });
      if (!audioBuf?.length) {
        return msg.reply('《✧》 No se pudo obtener el archivo de audio.');
      }
      if (audioBuf.length > MAX_AUDIO_SIZE) {
        return msg.reply('《✧》 El archivo supera el límite permitido de 60 MB.');
      }

      const caption =
        `✿ *Spotify — ${title}*\n\n` +
        `│ꕥ *Artista ::* ${artist}\n` +
        (album ? `│❀ *Álbum ::* ${album}\n` : '') +
        (duration && !String(duration).includes('NaN') ? `│⚘ *Duración ::* ${duration}\n` : '') +
        `│○ *Enlace ::* ${trackUrl}`;

      if (cover && /^https?:\/\//i.test(cover)) {
        await sock.sendMessage(msg.chat, { image: { url: cover }, caption }, { quoted: msg }).catch(() => msg.reply(caption));
      } else {
        await msg.reply(caption);
      }

      await sock.sendMessage(
        msg.chat,
        {
          audio: audioBuf,
          mimetype: 'audio/mpeg',
          fileName: `${cleanName(`${artist} - ${title}`)}.mp3`
        },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
