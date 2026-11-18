import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const LANGS = new Set([
  'es', 'en', 'pt', 'fr', 'it', 'de', 'ja', 'ko', 'zh', 'ru', 'ar',
  'hi', 'id', 'tr', 'nl', 'pl', 'sv', 'ca', 'gl', 'eu'
]);

function splitChunks(text, max = 190) {
  const words = text.split(/\s+/);
  const chunks = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w.slice(0, max);
    } else if (cur.length + 1 + w.length <= max) {
      cur += ' ' + w;
    } else {
      chunks.push(cur);
      cur = w.slice(0, max);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function fetchGoogleTts(text, lang) {
  const chunks = splitChunks(text, 190).slice(0, 5);
  const buffers = [];
  for (const part of chunks) {
    const url =
      `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob` +
      `&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(part)}`;
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 18_000,
      headers: {
        'User-Agent': DEFAULT_UA,
        Referer: 'https://translate.google.com/'
      }
    });
    const buf = Buffer.from(res.data);
    if (buf.length < 200) throw new Error('Audio vacío');
    buffers.push(buf);
  }
  return Buffer.concat(buffers);
}

export default {
  command: ['voz', 'gtts', 'hablar', 'speak'],
  category: 'utils',
  description: 'Convertir texto en nota de voz en español u otro idioma.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    let lang = 'es';
    let rest = [...args];

    if (rest.length >= 2 && LANGS.has(rest[0].toLowerCase())) {
      lang = rest.shift().toLowerCase();
    } else if (rest.length === 1 && LANGS.has(rest[0].toLowerCase()) && msg.quoted?.text) {
      lang = rest.shift().toLowerCase();
    }

    const text = rest.join(' ').trim() || String(msg.quoted?.text || msg.quoted?.caption || '').trim();
    if (!text) {
      return msg.reply(
        `《✧》 Escribe el texto (o responde a un mensaje) para convertirlo en voz.\n` +
        `> Ejemplos: *${usedPrefix + command} Hola a todos* · *${usedPrefix + command} ja Konnichiwa*`
      );
    }

    try {
      const audio = await fetchGoogleTts(text.slice(0, 850), lang);
      await sock.sendMessage(
        msg.chat,
        { audio, mimetype: 'audio/mpeg', ptt: true },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
