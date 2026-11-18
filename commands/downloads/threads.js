import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const THREADS_RE = /^https?:\/\/(?:www\.)?threads\.(?:net|com)\/.+/i;

async function fetchThreadsMedia(url) {
  const enc = encodeURIComponent(url);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';

  const providers = [
    async () => {
      const { data } = await axios.get(`${delirius}/download/threads?url=${enc}`, {
        timeout: 30_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.data || data?.result;
      const items = [];
      for (const v of d?.video_urls || d?.videos || []) {
        const u = typeof v === 'string' ? v : v?.download_url || v?.url;
        if (u) items.push({ type: 'video', url: u });
      }
      for (const im of d?.image_urls || d?.images || []) {
        const u = typeof im === 'string' ? im : im?.url;
        if (u) items.push({ type: 'image', url: u });
      }
      if (!items.length && Array.isArray(d?.media)) {
        for (const m of d.media) {
          const u = m?.video || m?.image || m?.url;
          if (u) items.push({ type: m?.video || /\.mp4/i.test(u) ? 'video' : 'image', url: u });
        }
      }
      return items.length ? { items, caption: d?.description || d?.caption || '' } : null;
    },
    async () => {
      const { data } = await axios.get(`https://api.siputzx.my.id/api/d/threads?url=${enc}`, {
        timeout: 30_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.data;
      const items = [];
      for (const v of d?.video_urls || []) {
        const u = typeof v === 'string' ? v : v?.download_url || v?.url;
        if (u) items.push({ type: 'video', url: u });
      }
      for (const im of d?.image_urls || []) {
        const u = typeof im === 'string' ? im : im?.url;
        if (u) items.push({ type: 'image', url: u });
      }
      return items.length ? { items, caption: '' } : null;
    },
    async () => {
      const { data } = await axios.get(`${vreden}/api/threads?url=${enc}`, {
        timeout: 30_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const d = data?.result || data?.data;
      const items = [];
      for (const v of d?.video_urls || []) {
        const u = typeof v === 'string' ? v : v?.download_url || v?.url;
        if (u) items.push({ type: 'video', url: u });
      }
      for (const im of d?.image_urls || []) {
        const u = typeof im === 'string' ? im : im?.url;
        if (u) items.push({ type: 'image', url: u });
      }
      return items.length ? { items, caption: '' } : null;
    }
  ];

  for (const fn of providers) {
    try {
      const r = await fn();
      if (r?.items?.length) return r;
    } catch {}
  }
  return null;
}

export default {
  command: ['threads', 'threadsdl'],
  category: 'downloads',
  description: 'Descargar videos o fotos de una publicación de Threads.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const url = (args[0] || '').trim();
    if (!url || !THREADS_RE.test(url)) {
      return msg.reply(
        `《✧》 Envía un enlace válido de *Threads*.\n` +
        `> Ejemplo: *${usedPrefix + command} https://www.threads.net/@user/post/...*`
      );
    }

    try {
      const result = await fetchThreadsMedia(url);
      if (!result?.items?.length) {
        return msg.reply('《✧》 No se pudo descargar la publicación de Threads.');
      }

      const slice = result.items.slice(0, 6);
      for (let i = 0; i < slice.length; i++) {
        const item = slice[i];
        const caption =
          i === 0
            ? `✿ *Threads Download*${result.caption ? `\n> ${String(result.caption).slice(0, 220)}` : ''}`
            : '';
        if (item.type === 'video') {
          await sock.sendMessage(msg.chat, { video: { url: item.url }, caption }, { quoted: msg });
        } else {
          await sock.sendMessage(msg.chat, { image: { url: item.url }, caption }, { quoted: msg });
        }
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
