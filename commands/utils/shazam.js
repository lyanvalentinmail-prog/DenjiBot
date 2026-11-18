import axios from 'axios';
import { uploadMedia, DEFAULT_UA } from '#simple';

async function identifyTrack(fileUrl) {
  const enc = encodeURIComponent(fileUrl);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    async () => {
      const { data } = await axios.get(`${delirius}/tools/whatmusic?url=${enc}`, {
        timeout: 30_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = Array.isArray(data?.data) ? data.data[0] : (data?.data || data?.result);
      if (!d?.title) return null;
      return {
        title: d.title,
        artist: d.artists || d.artist || 'Desconocido',
        album: d.album || '',
        genre: Array.isArray(d.genres) ? d.genres.join(', ') : (d.genres || d.genre || ''),
        release: d.release_date || d.release || '',
        duration: d.duration || '',
        image: d.image || d.thumbnail || '',
        links: Array.isArray(d.url) ? d.url : [d.spotify, d.youtube, d.apple_music].filter(Boolean)
      };
    },
    async () => {
      const { data } = await axios.get(`${vreden}/api/whatmusic?url=${enc}`, {
        timeout: 30_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.result || data?.data;
      if (!d?.title) return null;
      return {
        title: d.title,
        artist: d.artists || d.artist || 'Desconocido',
        album: d.album || '',
        genre: d.genres || d.genre || '',
        release: d.release || d.release_date || '',
        duration: d.duration || '',
        image: d.image || d.cover || '',
        links: [d.spotify, d.youtube].filter(Boolean)
      };
    },
    async () => {
      if (!yuki?.url) return null;
      const { data } = await axios.get(`${yuki.url}/tools/whatmusic?url=${enc}&key=${yuki.key}`, {
        timeout: 30_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = Array.isArray(data?.data) ? data.data[0] : data?.data;
      if (!d?.title) return null;
      return {
        title: d.title,
        artist: d.artist || 'Desconocido',
        album: d.album || '',
        genre: d.genres || '',
        release: d.release_date || '',
        duration: d.duration || '',
        image: d.image || '',
        links: Array.isArray(d.url) ? d.url : []
      };
    }
  ];

  for (const fn of providers) {
    try {
      const r = await fn();
      if (r?.title) return r;
    } catch {}
  }
  return null;
}

export default {
  command: ['shazam', 'whatmusic', 'quemusica'],
  category: 'utils',
  description: 'Reconocer el nombre de una canción en un audio o video.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
    if (!mime || !/^(audio|video)\//i.test(mime)) {
      return msg.reply(
        `《✧》 Responde a un *audio*, *nota de voz* o *video* corto con *${usedPrefix + command}*.`
      );
    }

    try {
      const buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar el archivo multimedia.');
      }
      if (buffer.length > 20 * 1024 * 1024) {
        return msg.reply('《✧》 El archivo es muy grande (máx. 20 MB). Envía un fragmento más corto.');
      }

      const uploaded = await uploadMedia(buffer);
      if (!uploaded?.url) {
        return msg.reply('《✧》 No se pudo subir el audio para analizarlo.');
      }

      const track = await identifyTrack(uploaded.url);
      if (!track) {
        return msg.reply('《✧》 No se pudo reconocer la canción. Prueba con un fragmento de 10–20 segundos más claro.');
      }

      const lines = [
        `✿ *Canción Identificada*`,
        '',
        `│ꕥ *Título ::* ${track.title}`,
        `│❀ *Artista ::* ${track.artist}`,
        track.album ? `│⚘ *Álbum ::* ${track.album}` : '',
        track.genre ? `│𓏸 *Género ::* ${track.genre}` : '',
        track.duration ? `│○ *Duración ::* ${track.duration}` : '',
        track.release ? `│✦ *Lanzamiento ::* ${track.release}` : ''
      ].filter(Boolean);

      if (track.links?.length) {
        lines.push('', ...track.links.slice(0, 3).map(u => `> » ${u}`));
      } else {
        lines.push('', `> ✎ Descárgala con *${usedPrefix}play ${track.artist} - ${track.title}*`);
      }

      const caption = lines.join('\n');
      if (track.image && /^https?:\/\//i.test(track.image)) {
        return await sock.sendMessage(msg.chat, { image: { url: track.image }, caption }, { quoted: msg })
          .catch(() => msg.reply(caption));
      }
      await msg.reply(caption);
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
