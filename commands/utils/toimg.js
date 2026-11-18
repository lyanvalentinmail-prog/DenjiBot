import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as cheerio from 'cheerio';

async function webpToPngLocal(buffer) {
  const tag = crypto.randomBytes(6).toString('hex');
  const inFile = path.join(tmpdir(), `toimg-${tag}.webp`);
  const outFile = path.join(tmpdir(), `toimg-${tag}.png`);
  await fsp.writeFile(inFile, buffer);
  try {
    await new Promise((resolve, reject) => {
      const p = spawn('ffmpeg', ['-y', '-i', inFile, '-frames:v', '1', outFile], {
        stdio: ['ignore', 'ignore', 'pipe']
      });
      p.on('error', reject);
      p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    });
    return await fsp.readFile(outFile);
  } finally {
    await fsp.unlink(inFile).catch(() => {});
    await fsp.unlink(outFile).catch(() => {});
  }
}

async function ezgifConvert(buffer, mode) {
  const endpoint = mode === 'mp4' ? 'webp-to-mp4' : 'webp-to-png';
  const form = new FormData();
  form.append('new-image-url', '');
  form.append('new-image', new Blob([buffer], { type: 'image/webp' }), 'image.webp');
  const res = await fetch(`https://ezgif.com/${endpoint}`, { method: 'POST', body: form });
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
  if (!file) throw new Error('No se pudo subir el sticker para convertirlo.');
  const res2 = await fetch(`https://ezgif.com/${endpoint}/${file}`, { method: 'POST', body: form2 });
  const html2 = await res2.text();
  const $2 = cheerio.load(html2);
  const selector = mode === 'mp4' ? 'div#output > p.outfile > video > source' : 'div#output > p.outfile > img';
  const src = $2(selector).attr('src');
  if (!src) throw new Error('No se pudo obtener el archivo convertido.');
  const outUrl = new URL(src, res2.url).toString();
  const mediaRes = await fetch(outUrl);
  return Buffer.from(await mediaRes.arrayBuffer());
}

export default {
  command: ['toimg', 'toimage'],
  category: 'utils',
  description: 'Convertir un sticker a imagen o GIF.',
  run: async ({ msg, sock }) => {
    if (!msg.quoted) {
      return sock.reply(msg.chat, '《✧》 Debes citar un sticker para convertir.', msg);
    }
    await msg.react('🕒');
    try {
      const quoted = msg.quoted;
      const buffer = await quoted.download();
      if (!buffer) {
        await msg.react('✖️');
        return sock.reply(msg.chat, '《✧》 No se pudo descargar el sticker.', msg);
      }
      const isAnimated = Boolean(quoted.msg?.isAnimated);
      if (isAnimated) {
        const mp4Buffer = await ezgifConvert(buffer, 'mp4');
        await sock.sendMessage(msg.chat, { video: mp4Buffer, caption: 'ꕥ *Aquí tienes ฅ^•ﻌ•^ฅ*', gifPlayback: true }, { quoted: msg });
      } else {
        const pngBuffer = await webpToPngLocal(buffer).catch(() => ezgifConvert(buffer, 'png'));
        await sock.sendMessage(msg.chat, { image: pngBuffer, caption: 'ꕥ *Aquí tienes ฅ^•ﻌ•^ฅ*' }, { quoted: msg });
      }
      await msg.react('✔️');
    } catch (error) {
      await msg.react('✖️');
      sock.reply(msg.chat, `《✧》 Error al convertir el sticker.\n${error.message}`, msg);
    }
  }
};
