import * as cheerio from 'cheerio';
import exif from '#core/exif';
import { DEFAULT_UA } from '#simple';

const { webpToPng, gifToMp4 } = exif;

async function ezgifConvert(buffer, mode) {
  const endpoint = mode === 'mp4' ? 'webp-to-mp4' : 'webp-to-png';
  const form = new FormData();
  form.append('new-image-url', '');
  form.append('new-image', new Blob([new Uint8Array(buffer)], { type: 'image/webp' }), 'image.webp');
  const res = await fetch(`https://ezgif.com/${endpoint}`, {
    method: 'POST',
    headers: { 'User-Agent': DEFAULT_UA },
    body: form,
    signal: AbortSignal.timeout(25_000)
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const form2 = new FormData();
  let file = '';
  $('form input[name]').each((_, input) => {
    const name = $(input).attr('name');
    const value = String($(input).val() ?? '');
    if (name) {
      if (name === 'file') file = value;
      form2.append(name, value);
    }
  });
  if (!file) throw new Error('No se pudo procesar el sticker.');
  const res2 = await fetch(`https://ezgif.com/${endpoint}/${file}`, {
    method: 'POST',
    headers: { 'User-Agent': DEFAULT_UA },
    body: form2,
    signal: AbortSignal.timeout(30_000)
  });
  const html2 = await res2.text();
  const $2 = cheerio.load(html2);
  const selector =
    mode === 'mp4' ? 'div#output > p.outfile > video > source' : 'div#output > p.outfile > img';
  const src = $2(selector).attr('src');
  if (!src) throw new Error('No se pudo obtener el archivo convertido.');
  const outUrl = new URL(src, res2.url).toString();
  const mediaRes = await fetch(outUrl, {
    headers: { 'User-Agent': DEFAULT_UA },
    signal: AbortSignal.timeout(25_000)
  });
  return Buffer.from(await mediaRes.arrayBuffer());
}

const hasAnimChunk = buf =>
  Buffer.isBuffer(buf) &&
  buf.length > 32 &&
  (buf.indexOf(Buffer.from('ANIM')) !== -1 || buf.indexOf(Buffer.from('ANMF')) !== -1);

export default {
  command: ['toimg', 'toimage', 'togif', 'tovideo'],
  category: 'utils',
  description: 'Convertir un sticker a imagen o GIF.',
  run: async ({ msg, sock, command }) => {
    if (!msg.quoted || !/webp/i.test(msg.quoted.mimetype || msg.quoted.mime || '')) {
      return sock.reply(msg.chat, '《✧》 Debes responder a un *sticker* para convertirlo.', msg);
    }
    try {
      const buffer = await msg.quoted.download();
      if (!buffer?.length) {
        return sock.reply(msg.chat, '《✧》 No se pudo descargar el sticker.', msg);
      }
      const isAnimated = Boolean(msg.quoted.isAnimated || msg.quoted.msg?.isAnimated || hasAnimChunk(buffer));
      const wantVideo = isAnimated || /gif|video/i.test(command);

      if (wantVideo && isAnimated) {
        const mp4Buffer = await ezgifConvert(buffer, 'mp4').catch(() => gifToMp4(buffer));
        await sock.sendMessage(
          msg.chat,
          { video: mp4Buffer, mimetype: 'video/mp4', caption: 'ꕥ *Aquí tienes ฅ^•ﻌ•^ฅ*', gifPlayback: command !== 'tovideo' },
          { quoted: msg }
        );
      } else {
        const pngBuffer = await webpToPng(buffer).catch(() => ezgifConvert(buffer, 'png'));
        await sock.sendMessage(
          msg.chat,
          { image: pngBuffer, caption: 'ꕥ *Aquí tienes ฅ^•ﻌ•^ฅ*' },
          { quoted: msg }
        );
      }
    } catch (error) {
      await sock.reply(msg.chat, `《✧》 Error al convertir el sticker.\n> ${error.message}`, msg);
    }
  }
};
