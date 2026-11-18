import axios from 'axios';
import { uploadMedia, DEFAULT_UA } from '#simple';

async function extractText(buffer, mime) {
  // 1) OCR.space (clave pública gratuita, multi-idioma automático)
  try {
    const b64 = `data:${mime || 'image/jpeg'};base64,${buffer.toString('base64')}`;
    const body = new URLSearchParams({
      base64Image: b64,
      OCREngine: '2',
      scale: 'true',
      detectOrientation: 'true'
    }).toString();

    const { data } = await axios.post('https://api.ocr.space/parse/image', body, {
      headers: {
        apikey: 'helloworld',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': DEFAULT_UA
      },
      timeout: 30_000
    });
    const text = (data?.ParsedResults || [])
      .map(r => String(r?.ParsedText || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
    if (text) return text;
  } catch {}

  // 2) Respaldo mediante subida temporal y APIs de OCR
  const uploaded = await uploadMedia(buffer).catch(() => null);
  if (!uploaded?.url) return null;
  const enc = encodeURIComponent(uploaded.url);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';

  const urls = [
    `https://api.siputzx.my.id/api/tools/ocr?url=${enc}`,
    `${delirius}/tools/ocr?url=${enc}`,
    `${vreden}/api/ocr?url=${enc}`
  ];

  for (const url of urls) {
    try {
      const { data } = await axios.get(url, {
        timeout: 30_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const text = String(
        data?.data?.text || data?.result?.text || data?.text ||
        (typeof data?.data === 'string' ? data.data : '') ||
        (typeof data?.result === 'string' ? data.result : '')
      ).trim();
      if (text) return text;
    } catch {}
  }
  return null;
}

export default {
  command: ['ocr', 'totext', 'leerimagen'],
  category: 'utils',
  description: 'Extraer y copiar el texto escrito dentro de una imagen.',
  run: async ({ msg, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = q?.mimetype || q?.mime || q?.msg?.mimetype || '';
    if (!mime || !/^image\/(jpe?g|png|webp)$/i.test(mime)) {
      return msg.reply(`《✧》 Envía o responde a una *imagen* con texto usando *${usedPrefix + command}*.`);
    }

    try {
      const buffer = await q.download?.();
      if (!buffer?.length) {
        return msg.reply('《✧》 No se pudo descargar la imagen.');
      }

      const text = await extractText(buffer, mime);
      if (!text) {
        return msg.reply('《✧》 No se detectó texto legible en la imagen.');
      }

      await msg.reply(`✿ *Texto detectado (OCR)*\n\n${text.slice(0, 3900)}`);
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
