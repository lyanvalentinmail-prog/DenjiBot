import axios from 'axios';
import db from '#db';
import { uploadMedia, DEFAULT_UA } from '#simple';

const langs = {
  typescript: 'ts', javascript: 'js', python: 'py', html: 'html', css: 'css',
  java: 'java', cpp: 'cpp', c: 'c', json: 'json', bash: 'sh', sql: 'sql',
  rust: 'rs', go: 'go', php: 'php', ruby: 'rb'
};

function detectLanguage(query, response) {
  const q = query.toLowerCase();
  const asksCode = /(c[oó]digo|code|programa|script|funci[oó]n|clase|algoritmo|implementa)/i.test(q);
  if (!asksCode) return null;
  for (const name of Object.keys(langs)) {
    if (q.includes(name)) return name;
  }
  if (/def |print\s*\(/i.test(response)) return 'python';
  if (/<html|<div|<body/i.test(response)) return 'html';
  if (/SELECT |INSERT |CREATE TABLE/i.test(response)) return 'sql';
  if (/function|const |let |=>|\bimport\b|\bexport\b/i.test(response)) return 'javascript';
  return null;
}

async function queryAI(text, systemPrompt, sender, imageUrl) {
  const encText = encodeURIComponent(text);
  const encPrompt = encodeURIComponent(systemPrompt);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    async () => {
      const body = { content: text, user: sender, prompt: systemPrompt, model: 'gemini' };
      if (imageUrl) body.imageBuffer = imageUrl;
      const { data } = await axios.post('https://ai.siputzx.my.id', body, {
        timeout: 25_000,
        headers: { 'User-Agent': DEFAULT_UA, 'Content-Type': 'application/json' }
      });
      return typeof data?.result === 'string' && data.result.trim() ? data.result : null;
    },
    async () => {
      const { data } = await axios.get(`${delirius}/ia/gptprompt?text=${encText}&prompt=${encPrompt}`, {
        timeout: 25_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ans = data?.data || data?.result;
      return typeof ans === 'string' && ans.trim() && !/^Error:/i.test(ans) ? ans : null;
    },
    async () => {
      const { data } = await axios.get(`${delirius}/ia/chatgpt?q=${encText}`, {
        timeout: 25_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ans = data?.data || data?.result;
      return typeof ans === 'string' && ans.trim() && !/^Error:/i.test(ans) ? ans : null;
    },
    async () => {
      const { data } = await axios.post(
        'https://text.pollinations.ai/openai',
        {
          model: 'openai',
          messages: [
            { role: 'system', content: systemPrompt },
            ...(imageUrl
              ? [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: imageUrl } }] }]
              : [{ role: 'user', content: text }])
          ]
        },
        { timeout: 30_000, headers: { 'Content-Type': 'application/json', 'User-Agent': DEFAULT_UA } }
      );
      const ans = data?.choices?.[0]?.message?.content;
      return typeof ans === 'string' && ans.trim() ? ans : null;
    },
    async () => {
      const { data } = await axios.get(`${vreden}/api/v1/artificial/chatgpt?query=${encText}`, {
        timeout: 25_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ans = data?.result?.answer || data?.result;
      return typeof ans === 'string' && ans.trim() ? ans : null;
    },
    async () => {
      if (!yuki?.url) return null;
      const { data } = await axios.get(`${yuki.url}/ai/gptprompt?text=${encText}&prompt=${encPrompt}&key=${yuki.key}`, {
        timeout: 25_000
      });
      const ans = data?.result?.text || data?.result || data?.results;
      return typeof ans === 'string' && ans.trim() ? ans : null;
    }
  ];

  for (const fn of providers) {
    try {
      const res = await fn();
      if (res) return res.trim();
    } catch {}
  }
  return null;
}

export default {
  command: ['ia', 'chatgpt', 'ai', 'gpt'],
  category: 'utils',
  description: 'Realizar peticiones a la inteligencia artificial.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const text = (args.join(' ').trim() || (!msg.quoted?.isMedia ? msg.quoted?.text?.trim() : '') || '').trim();
    if (!text) {
      return msg.reply('《✧》 Escribe una pregunta o petición para que la *IA* te responda.');
    }
    const botId = sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
    const settings = db.getSettings(botId);
    const user = db.getUser(msg.sender);
    const username = user?.name || msg.pushName || 'usuario';
    const botname = settings.botname || global.botName || 'Denji bot';
    const devName = global.dev || 'Lyan';
    const basePrompt = `Tu nombre es ${botname}, creado por ${devName}. Respondes siempre en español de forma clara, amigable y útil. Estás hablando con ${username}.`;

    try {
      let imageUrl = null;
      const mediaSrc = msg.quoted?.isMedia ? msg.quoted : msg.isMedia ? msg : null;
      if (mediaSrc && /^image\/(jpe?g|png|webp)$/i.test(mediaSrc.mimetype || '')) {
        try {
          const buf = await mediaSrc.download();
          if (buf?.length) {
            const up = await uploadMedia(buf);
            imageUrl = up.url;
          }
        } catch {}
      }

      const sent = await sock.sendMessage(
        msg.chat,
        { text: `ꕥ *${botname}* está pensando tu respuesta...` },
        { quoted: msg }
      );

      const answer = await queryAI(text, basePrompt, msg.sender, imageUrl);
      if (!answer) {
        const failMsg = '《✧》 No se pudo obtener una respuesta en este momento. Intenta de nuevo.';
        if (sent?.key) {
          await sock.sendMessage(msg.chat, { text: failMsg, edit: sent.key }).catch(() => msg.reply(failMsg));
        } else {
          await msg.reply(failMsg);
        }
        return;
      }

      const lang = detectLanguage(text, answer);
      if (lang && !answer.includes('```')) {
        const ext = langs[lang] ?? 'txt';
        const header = `ꕥ *${botname}* · \`respuesta.${ext}\``;
        if (sent?.key) {
          await sock.sendMessage(msg.chat, { text: `${header}\n\n\`\`\`\n${answer}\n\`\`\``, edit: sent.key })
            .catch(() => sock.sendCodeMessage(msg.chat, header, answer, msg));
        } else {
          await sock.sendCodeMessage(msg.chat, header, answer, msg);
        }
      } else if (sent?.key) {
        await sock.sendMessage(msg.chat, { text: answer, edit: sent.key }).catch(() => msg.reply(answer));
      } else {
        await msg.reply(answer);
      }
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
