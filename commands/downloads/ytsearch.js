import yts from 'yt-search';

export default {
  command: ['ytsearch', 'yts', 'search'],
  category: 'downloads',
  description: 'Realizar búsquedas en YouTube.',
  run: async ({ sock, msg, args, usedPrefix, command }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return msg.reply('《✧》 Por favor, ingresa un término para buscar en YouTube.');
    }
    try {
      const results = await yts(query);
      const videos = Array.isArray(results?.videos)
        ? results.videos
        : (results?.all || []).filter(v => v.type === 'video');
      if (!videos.length) {
        return msg.reply(`《✧》 No se encontraron resultados para *${query}*.`);
      }

      const body = videos
        .slice(0, 12)
        .map((v, i) => {
          const author = v.author?.name || 'Desconocido';
          const views = Number(v.views || 0).toLocaleString('es-ES');
          return (
            `*${i + 1}. ${v.title || 'Sin título'}*\n` +
            `> ❖ Canal › *${author}*\n` +
            `> ⴵ Duración › *${v.timestamp || 'Desconocida'}*\n` +
            `> ❀ Vistas › *${views}*\n` +
            `> ✩ Subido › *${v.ago || 'Desconocido'}*\n` +
            `> ❒ Enlace › ${v.url}`
          );
        })
        .join('\n\n••••••••••••••••••••••••••••••••••••\n\n');

      const thumb = videos[0]?.image || videos[0]?.thumbnail;
      if (thumb) {
        await sock.sendMessage(msg.chat, { image: { url: thumb }, caption: body }, { quoted: msg })
          .catch(() => msg.reply(body));
      } else {
        await msg.reply(body);
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
