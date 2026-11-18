import axios from 'axios';
import { getBuffer, DEFAULT_UA } from '#simple';

const MAX_AUDIO_SIZE = 60 * 1024 * 1024;
const SC_URL_RE = /^https?:\/\/(?:m\.|on\.|www\.)?soundcloud\.com\/.+/i;

const cleanName = (s = 'soundcloud') =>
  String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'soundcloud';

async function resolveTrackUrl(query) {
  if (SC_URL_RE.test(query)) return { url: query };
  const q = encodeURIComponent(query);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';

  const searches = [
    async () => {
      const { data } = await axios.get(`${delirius}/search/soundcloud?q=${q}&limit=5`, {
        timeout: 18_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const it = data?.data?.[0] || data?.result?.[0];
      return it?.link || it?.url
        ? { url: it.link || it.url, title: it.title, artist: it.artist || it.author, image: it.image || it.thumbnail }
        : null;
    },
    async () => {
      const { data } = await axios.get(`https://api.siputzx.my.id/api/s/soundcloud?query=${q}`, {
        timeout: 18_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const it = data?.data?.[0];
      return it?.permalink_url || it?.url
        ? { url: it.permalink_url || it.url, title: it.title, artist: it.user || it.author, image: it.artwork_url || it.thumbnail }
        : null;
    },
    async () => {
      const { data } = await axios.get(`${vreden}/api/soundcloudsearch?query=${q}`, {
        timeout: 18_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const it = data?.result?.[0] || data?.data?.[0];
      return it?.url ? { url: it.url, title: it.title, artist: it.artist, image: it.thumb || it.image } : null;
    }
  ];

  for (const fn of searches) {
    try {
      const r = await fn();
      if (r?.url) return r;
    } catch {}
  }
  return null;
}

async function downloadSoundCloud(trackUrl) {
  const enc = encodeURIComponent(trackUrl);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';

  const providers = [
    async () => {
      const { data } = await axios.get(`${delirius}/download/soundcloud?url=${enc}`, {
        timeout: 35_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.data || data?.result;
      const dl = d?.download || d?.link || d?.url;
      return dl ? { dl, title: d.title, artist: d.author || d.artist, image: d.image || d.imageURL || d.thumbnail } : null;
    },
    async () => {
      const { data } = await axios.get(`https://api.siputzx.my.id/api/d/soundcloud?url=${enc}`, {
        timeout: 35_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.data;
      const dl = d?.url || d?.download;
      return dl ? { dl, title: d.title, artist: d.user || d.author, image: d.thumbnail } : null;
    },
    async () => {
      const { data } = await axios.get(`${vreden}/api/soundclouddl?url=${enc}`, {
        timeout: 35_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.result || data?.data;
      const dl = d?.download || d?.music || d?.url;
      return dl ? { dl, title: d.title, artist: d.author, image: d.thumbnail || d.image } : null;
    }
  ];

  for (const fn of providers) {
    try {
      const r = await fn();
      if (r?.dl && /^https?:\/\//i.test(r.dl)) return r;
    } catch {}
  }
  return null;
}

export default {
  command: ['soundcloud', 'scdl'],
  category: 'downloads',
  description: 'Buscar y descargar canciones de SoundCloud.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return msg.reply(
        `《✧》 Ingresa el nombre o enlace de una pista de SoundCloud.\n` +
        `> Ejemplo: *${usedPrefix + command} lofi hip hop*`
      );
    }

    try {
      const found = await resolveTrackUrl(query);
      if (!found?.url) {
        return msg.reply(`《✧》 No se encontró ninguna pista en SoundCloud para *${query}*.`);
      }

      const track = await downloadSoundCloud(found.url);
      if (!track?.dl) {
        return msg.reply('《✧》 No se pudo descargar el audio de SoundCloud en este momento.');
      }

      const buf = await getBuffer(track.dl, { timeout: 55_000 });
      if (!buf?.length || buf.length > MAX_AUDIO_SIZE) {
        return msg.reply('《✧》 No se pudo obtener el audio o supera el límite de 60 MB.');
      }

      const title = track.title || found.title || 'SoundCloud';
      const artist = track.artist || found.artist || 'Desconocido';
      const cover = track.image || found.image || '';
      const caption =
        `✿ *SoundCloud — ${title}*\n\n` +
        `│ꕥ *Artista ::* ${artist}\n` +
        `│○ *Enlace ::* ${found.url}`;

      if (cover && /^https?:\/\//i.test(cover)) {
        await sock.sendMessage(msg.chat, { image: { url: cover }, caption }, { quoted: msg }).catch(() => msg.reply(caption));
      } else {
        await msg.reply(caption);
      }

      await sock.sendMessage(
        msg.chat,
        { audio: buf, mimetype: 'audio/mpeg', fileName: `${cleanName(title)}.mp3` },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
