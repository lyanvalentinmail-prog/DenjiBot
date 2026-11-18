import axios from 'axios';
import db from '#db';
import { DEFAULT_UA } from '#simple';

async function fetchBratVideo(text) {
  const enc = encodeURIComponent(text);
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const yuki = global.APIs?.yuki;

  const endpoints = [
    `https://api.ryuzei.xyz/canvas/bratvid?text=${enc}`,
    `${vreden}/api/v1/maker/bratvid?text=${enc}`,
    `https://api.siputzx.my.id/api/m/brat?text=${enc}&isAnimated=true&delay=500`,
    `${delirius}/canvas/bratvid?text=${enc}`,
    ...(yuki?.url ? [`${yuki.url}/sticker/bratv?text=${enc}&key=${yuki.key}`] : [])
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ct = String(res.headers?.['content-type'] || '').toLowerCase();
      const buf = Buffer.from(res.data);
      if (ct.includes('application/json')) {
        const json = JSON.parse(buf.toString('utf8'));
        const vidUrl = json?.url || json?.data?.url || json?.result?.url || json?.result;
        if (typeof vidUrl === 'string' && /^https?:\/\//i.test(vidUrl)) {
          const r2 = await axios.get(vidUrl, { responseType: 'arraybuffer', timeout: 25_000 });
          if (r2.data?.byteLength > 500) return Buffer.from(r2.data);
        }
        continue;
      }
      if (!ct.includes('text/html') && buf.length > 500) return buf;
    } catch {}
  }
  throw new Error('No se pudo generar el video-sticker brat en este momento.');
}

export default {
  command: ['bratv', 'bratvid'],
  category: 'stickers',
  description: 'Crear un video-sticker estilo brat.',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    try {
      const content = (text || msg.quoted?.text || '').trim();
      if (!content) {
        return sock.reply(msg.chat, '《✧》 Por favor, responde a un mensaje o ingresa un texto para crear el sticker.', msg);
      }
      const user = db.getUser(msg.sender);
      const name = user?.name || msg.pushName || msg.sender.split('@')[0];
      const meta1 = user?.metadatos ? String(user.metadatos).trim() : '';
      const meta2 = user?.metadatos2 ? String(user.metadatos2).trim() : '';
      const packname = meta1 || global.botName || 'Denji bot';
      const author = meta1 ? meta2 : `@${name}`;

      const videoBuffer = await fetchBratVideo(content);
      await sock.sendVideoAsSticker(msg.chat, videoBuffer, msg, { packname, author });
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
