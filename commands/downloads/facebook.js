import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const FB_REGEX = /https?:\/\/((www|m|web|mbasic)\.)?(facebook\.com|fb\.watch|fb\.com)\/\S+/i;

async function fetchJson(url) {
  const { data } = await axios.get(url, {
    timeout: 22_000,
    headers: { 'User-Agent': DEFAULT_UA, Accept: 'application/json' }
  });
  return data;
}

function unescapeFbUrl(raw = '') {
  return String(raw)
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

async function scrapeDirectFb(url) {
  const res = await axios.get(url, {
    timeout: 18_000,
    maxRedirects: 6,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    }
  });
  const html = String(res.data || '');
  const hd = html.match(/"browser_native_hd_url":"((?:\\.|[^"\\])+)"/)?.[1];
  const sd = html.match(/"browser_native_sd_url":"((?:\\.|[^"\\])+)"/)?.[1];
  const playableHd = html.match(/"playable_url_quality_hd":"((?:\\.|[^"\\])+)"/)?.[1];
  const playableSd = html.match(/"playable_url":"((?:\\.|[^"\\])+)"/)?.[1];
  const chosen = hd || playableHd || sd || playableSd;
  if (!chosen) return null;
  const title = html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] || null;
  return {
    url: unescapeFbUrl(chosen),
    resolution: hd || playableHd ? 'HD' : 'SD',
    title
  };
}

async function getFacebookVideo(url) {
  const enc = encodeURIComponent(url);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    async () => {
      const d = await fetchJson(`${vreden}/api/v1/download/facebook?url=${enc}`);
      const r = d?.result;
      const dl = r?.download?.hd || r?.download?.sd || r?.hd_url || r?.sd_url || r?.url;
      return dl ? { url: dl, resolution: r?.download?.hd || r?.hd_url ? 'HD' : 'SD', title: r?.title } : null;
    },
    async () => {
      const d = await fetchJson(`${delirius}/download/facebook?url=${enc}`);
      const urls = Array.isArray(d?.urls) ? d.urls : Array.isArray(d?.data) ? d.data : [];
      const hd = urls.find(x => x?.hd)?.hd;
      const sd = urls.find(x => x?.sd)?.sd;
      const anyUrl = hd || sd || d?.data?.hd || d?.data?.sd || d?.data?.url || urls[0]?.url;
      return anyUrl ? { url: anyUrl, resolution: hd || d?.data?.hd ? 'HD' : 'SD', title: d?.title || d?.data?.title } : null;
    },
    async () => {
      const d = await fetchJson(`https://api.siputzx.my.id/api/d/facebook?url=${enc}`);
      const list = Array.isArray(d?.data) ? d.data : [];
      const hd = list.find(x => /hd|720|1080/i.test(String(x?.resolution || '')))?.url;
      const anyUrl = hd || list[0]?.url || d?.data?.url;
      return anyUrl ? { url: anyUrl, resolution: hd ? 'HD' : 'SD', title: d?.data?.title } : null;
    },
    async () => {
      const d = await fetchJson(`https://api.ryuzei.xyz/download/facebook?url=${enc}`);
      const r = d?.result || d?.data;
      const dl = r?.hd || r?.sd || r?.url || (Array.isArray(r) ? r[0]?.url : null);
      return dl ? { url: dl, resolution: r?.hd ? 'HD' : 'SD', title: r?.title } : null;
    },
    async () => {
      if (!yuki?.url) return null;
      const d = await fetchJson(`${yuki.url}/dl/facebook?url=${enc}&key=${yuki.key}`);
      const r = d?.data || d?.result;
      const dl = r?.hd || r?.sd || r?.url || (Array.isArray(r?.result) ? r.result[0]?.url : null);
      return dl ? { url: dl, resolution: r?.hd ? 'HD' : 'SD', title: r?.title } : null;
    },
    () => scrapeDirectFb(url)
  ];

  for (const fn of providers) {
    try {
      const out = await fn();
      if (out?.url && /^https?:\/\//i.test(out.url)) return out;
    } catch {}
  }
  return null;
}

export default {
  command: ['fb', 'facebook', 'fbdl'],
  category: 'downloads',
  description: 'Descargar videos y reels de Facebook.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const raw = args.join(' ').trim();
    if (!raw) {
      return msg.reply('《✧》 Por favor, ingresa un enlace de Facebook.');
    }
    const url = raw.match(FB_REGEX)?.[0] || '';
    if (!url) {
      return msg.reply('《✧》 El enlace no parece válido. Asegúrate de que sea un video o reel de Facebook.');
    }
    try {
      const data = await getFacebookVideo(url);
      if (!data?.url) {
        return msg.reply('《✧》 No se pudo obtener el video. Verifica que la publicación sea pública.');
      }
      const caption =
        `ㅤ۟∩　ׅ　★ ໌　ׅ　🅕𝖺𝖼𝖾𝖻𝗈𝗈𝗄 🅓ownload　ׄᰙ\n\n` +
        (data.title ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Título* › ${String(data.title).slice(0, 250)}\n` : '') +
        (data.resolution ? `𖣣ֶㅤ֯⌗ ❀  ⬭ *Calidad* › ${data.resolution}\n` : '') +
        `𖣣ֶㅤ֯⌗ ❀  ⬭ *Enlace* › ${url}`;
      await sock.sendMessage(
        msg.chat,
        { video: { url: data.url }, mimetype: 'video/mp4', fileName: 'facebook.mp4', caption },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
