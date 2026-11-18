import axios from 'axios';
import { DEFAULT_UA } from '#simple';

function validatePublicUrl(raw = '') {
  let u = String(raw || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const p = new URL(u);
    if (!['http:', 'https:'].includes(p.protocol) || !p.hostname.includes('.')) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(p.hostname)) return null;
    return p.href;
  } catch {
    return null;
  }
}

async function shorten(url) {
  const enc = encodeURIComponent(url);
  const providers = [
    async () => {
      const { data } = await axios.get(`https://tinyurl.com/api-create.php?url=${enc}`, {
        timeout: 12_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const s = String(data || '').trim();
      return /^https?:\/\/tinyurl\.com\//i.test(s) ? s : null;
    },
    async () => {
      const { data } = await axios.get(`https://is.gd/create.php?format=simple&url=${enc}`, {
        timeout: 12_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const s = String(data || '').trim();
      return /^https?:\/\/is\.gd\//i.test(s) ? s : null;
    },
    async () => {
      const { data } = await axios.post(
        'https://cleanuri.com/api/v1/shorten',
        new URLSearchParams({ url }).toString(),
        {
          timeout: 12_000,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': DEFAULT_UA }
        }
      );
      return data?.result_url || null;
    }
  ];

  for (const fn of providers) {
    try {
      const r = await fn();
      if (r) return r;
    } catch {}
  }
  return null;
}

export default {
  command: ['acortar', 'short', 'tinyurl', 'shorturl'],
  category: 'utils',
  description: 'Acortar un enlace largo.',
  run: async ({ msg, args, usedPrefix, command }) => {
    const raw = args[0] || String(msg.quoted?.text || '').trim().split(/\s+/)[0] || '';
    const url = validatePublicUrl(raw);
    if (!url) {
      return msg.reply(
        `《✧》 Ingresa un enlace válido para acortar.\n` +
        `> Ejemplo: *${usedPrefix + command} https://github.com/lyanvalentinmail-prog/DenjiBot*`
      );
    }

    try {
      const short = await shorten(url);
      if (!short) {
        return msg.reply('《✧》 No se pudo acortar el enlace en este momento.');
      }

      await msg.reply(
        `✿ *Enlace acortado*\n\n` +
        `│ꕥ *Corto ::* ${short}\n` +
        `│○ *Original ::* ${url}`
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
