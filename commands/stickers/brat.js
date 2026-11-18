import axios from 'axios';
import db from '#db';
import { DEFAULT_UA } from '#simple';

async function fetchBratImage(text) {
  const enc = encodeURIComponent(text);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const endpoints = [
    `https://api.ryuzei.xyz/canvas/brat?text=${enc}`,
    `${delirius}/canvas/brat?text=${enc}`,
    `${vreden}/api/v1/maker/brat?text=${enc}`,
    `https://api.siputzx.my.id/api/m/brat?text=${enc}&isAnimated=false`,
    ...(yuki?.url ? [`${yuki.url}/sticker/brat?text=${enc}&key=${yuki.key}`] : [])
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ct = String(res.headers?.['content-type'] || '').toLowerCase();
      const buf = Buffer.from(res.data);
      if (ct.includes('application/json')) {
        const json = JSON.parse(buf.toString('utf8'));
        const imgUrl = json?.url || json?.data?.url || json?.result?.url || json?.result;
        if (typeof imgUrl === 'string' && /^https?:\/\//i.test(imgUrl)) {
          const r2 = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20_000 });
          if (r2.data?.byteLength > 500) return Buffer.from(r2.data);
        }
        continue;
      }
      if (!ct.includes('text/html') && buf.length > 500) return buf;
    } catch {}
  }
  throw new Error('No se pudo generar el sticker brat en este momento.');
}

export default {
  command: ['brat'],
  category: 'stickers',
  description: 'Crear un sticker estilo brat.',
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

      const buffer = await fetchBratImage(content);
      await sock.sendImageAsSticker(msg.chat, buffer, msg, { packname, author });
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
