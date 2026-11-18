import axios from 'axios';
import { DEFAULT_UA } from '#simple';

function normalizeUrl(raw = '') {
  let u = String(raw || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase();
    // Bloquear direcciones locales o privadas (protección SSRF).
    if (
      host === 'localhost' ||
      !host.includes('.') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith('[')
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export default {
  command: ['ssweb', 'ss', 'captura'],
  category: 'utils',
  description: 'Tomar una captura de pantalla de una página web.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const url = normalizeUrl(args[0]);
    if (!url) {
      return msg.reply(
        `《✧》 Ingresa una URL pública válida.\n` +
        `> Ejemplo: *${usedPrefix + command} https://github.com*`
      );
    }

    try {
      const enc = encodeURIComponent(url);
      const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
      const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';

      const providers = [
        `https://image.thum.io/get/width/1280/crop/800/noanimate/${url}`,
        `https://api.siputzx.my.id/api/tools/ssweb?url=${enc}&theme=light&device=desktop`,
        `${delirius}/tools/ssweb?url=${enc}`,
        `${vreden}/api/ssweb?url=${enc}&type=desktop`
      ];

      let screenshot = null;
      for (const endpoint of providers) {
        try {
          const res = await axios.get(endpoint, {
            responseType: 'arraybuffer',
            timeout: 30_000,
            headers: { 'User-Agent': DEFAULT_UA }
          });
          const ct = String(res.headers?.['content-type'] || '').toLowerCase();
          const buf = Buffer.from(res.data);
          if (ct.startsWith('image/') && buf.length > 2000) {
            screenshot = buf;
            break;
          }
        } catch {}
      }

      if (!screenshot) {
        return msg.reply('《✧》 No se pudo capturar la página web en este momento.');
      }

      await sock.sendMessage(
        msg.chat,
        { image: screenshot, caption: `✿ *Captura web*\n> ${url}` },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
