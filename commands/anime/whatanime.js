import { DEFAULT_UA } from '#simple';

function formatTimestamp(sec = 0) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

export default {
  command: ['whatanime', 'wait', 'queanime'],
  category: 'anime',
  description: 'Identificar el anime, episodio y escena de una imagen.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
    if (!mime || !/^image\/(jpe?g|png|webp)$/i.test(mime)) {
      return msg.reply(
        `《✧》 Envía o responde a una captura de anime con *${usedPrefix + command}*.`
      );
    }

    try {
      const buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar la imagen.');
      }

      const form = new FormData();
      form.append('image', new Blob([buffer], { type: mime }), 'scene.jpg');

      const res = await fetch('https://api.trace.moe/search?anilistInfo&cutBorders', {
        method: 'POST',
        headers: { 'user-agent': DEFAULT_UA },
        body: form,
        signal: AbortSignal.timeout(35_000)
      });
      if (!res.ok) {
        return msg.reply('《✧》 El buscador de escenas no está disponible en este momento.');
      }

      const data = await res.json();
      // Filtrar estrictamente contenido SFW (sin material para adultos).
      const matches = (data?.result || []).filter(item => !item?.anilist?.isAdult);
      const best = matches[0];
      if (!best) {
        return msg.reply('《✧》 No se encontró ninguna coincidencia SFW para esta imagen.');
      }

      const titleObj = best.anilist?.title || {};
      const romaji = titleObj.romaji || best.filename || 'Desconocido';
      const english = titleObj.english && titleObj.english !== romaji ? titleObj.english : '';
      const native = titleObj.native || '';
      const episode = best.episode != null ? String(best.episode) : 'Película / OVA';
      const similarity = ((Number(best.similarity) || 0) * 100).toFixed(1);
      const range = `${formatTimestamp(best.from)} – ${formatTimestamp(best.to)}`;
      const anilistId = best.anilist?.id;
      const anilistUrl = anilistId ? `https://anilist.co/anime/${anilistId}` : '';
      const lowConf = Number(best.similarity) < 0.87
        ? '\n> ⚠️ Similitud baja: usa una captura sin recortes ni subtítulos grandes para mayor precisión.'
        : '';

      const caption =
        `✿ *Anime Identificado*\n\n` +
        `│ꕥ *Título ::* ${romaji}\n` +
        (english ? `│❀ *Inglés ::* ${english}\n` : '') +
        (native ? `│⚘ *Japonés ::* ${native}\n` : '') +
        `│𓏸 *Episodio ::* ${episode}\n` +
        `│○ *Escena ::* ${range}\n` +
        `│✦ *Similitud ::* ${similarity}%` +
        (anilistUrl ? `\n│✎ *AniList ::* ${anilistUrl}` : '') +
        lowConf;

      if (best.image && /^https?:\/\//i.test(best.image)) {
        return sock.sendMessage(
          msg.chat,
          { image: { url: best.image }, caption },
          { quoted: msg }
        ).catch(() => msg.reply(caption));
      }
      return msg.reply(caption);
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
