import axios from 'axios';
import { DEFAULT_UA } from '#simple';

async function fetchLyrics(query) {
  const q = encodeURIComponent(query);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';

  const providers = [
    // 1) LRCLIB: catálogo abierto de letras sin API key
    async () => {
      const { data } = await axios.get(`https://lrclib.net/api/search?q=${q}`, {
        timeout: 15_000,
        headers: { 'User-Agent': 'DenjiBot/1.0 (https://github.com/lyanvalentinmail-prog/DenjiBot)' }
      });
      if (!Array.isArray(data) || !data.length) return null;
      const best = data.find(x => x?.plainLyrics) || data.find(x => x?.syncedLyrics);
      if (!best) return null;
      const text = best.plainLyrics || String(best.syncedLyrics || '').replace(/\[[0-9:.]+\]\s*/g, '');
      if (!text.trim()) return null;
      return {
        title: best.trackName || best.name || query,
        artist: best.artistName || 'Desconocido',
        album: best.albumName || '',
        lyrics: text.trim(),
        image: ''
      };
    },
    // 2) Delirius
    async () => {
      const { data } = await axios.get(`${delirius}/search/letra?query=${q}`, {
        timeout: 18_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.data || data?.result;
      if (!d?.lyrics) return null;
      return {
        title: d.title || query,
        artist: d.artist || d.author || 'Desconocido',
        album: d.album || '',
        lyrics: String(d.lyrics).trim(),
        image: d.image || d.thumbnail || ''
      };
    },
    // 3) Vreden
    async () => {
      const { data } = await axios.get(`${vreden}/api/lyrics?query=${q}`, {
        timeout: 18_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.result || data?.data;
      const lyr = d?.lyrics || (Array.isArray(d) ? d[0]?.plainLyrics || d[0]?.lyrics : '');
      if (!lyr) return null;
      const rec = Array.isArray(d) ? d[0] : d;
      return {
        title: rec.title || rec.trackName || query,
        artist: rec.artist || rec.artistName || 'Desconocido',
        album: rec.album || rec.albumName || '',
        lyrics: String(lyr).trim(),
        image: rec.image || rec.thumb || ''
      };
    }
  ];

  for (const fn of providers) {
    try {
      const r = await fn();
      if (r?.lyrics) return r;
    } catch {}
  }
  return null;
}

export default {
  command: ['lyrics', 'letra', 'lirik'],
  category: 'utils',
  description: 'Buscar la letra completa de una canción.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return msg.reply(
        `《✧》 Ingresa el nombre de la canción (y artista opcional).\n` +
        `> Ejemplo: *${usedPrefix + command} Kick Back Kenshi Yonezu*`
      );
    }

    try {
      const song = await fetchLyrics(query);
      if (!song) {
        return msg.reply(`《✧》 No se encontró la letra de *${query}*.`);
      }

      const maxLen = 3800;
      const body = song.lyrics.length > maxLen
        ? song.lyrics.slice(0, maxLen).trimEnd() + '\n…'
        : song.lyrics;

      const text =
        `✿ *${song.title}*\n` +
        `> ꕥ *Artista ::* ${song.artist}` +
        (song.album ? ` · *Álbum ::* ${song.album}` : '') +
        `\n\n${body}`;

      if (song.image && /^https?:\/\//i.test(song.image)) {
        return await sock.sendMessage(msg.chat, { image: { url: song.image }, caption: text }, { quoted: msg })
          .catch(() => msg.reply(text));
      }
      await msg.reply(text);
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
