import axios from 'axios';
import { getBuffer, DEFAULT_UA } from '#simple';

const SOURCES = [
  'https://raw.githubusercontent.com/ShirokamiRyzen/WAbot-DB/main/fitur_db/ppcp.json',
  'https://raw.githubusercontent.com/BrunoSobrino/TheMystic-Bot-MD/master/src/JSON/anime-pareja.json'
];

async function fetchCouplePair() {
  for (const src of SOURCES) {
    try {
      const { data } = await axios.get(src, { timeout: 15_000, headers: { 'User-Agent': DEFAULT_UA } });
      if (!Array.isArray(data) || !data.length) continue;
      for (let attempt = 0; attempt < 5; attempt++) {
        const pick = data[Math.floor(Math.random() * data.length)];
        const maleUrl = pick?.cowo || pick?.male || pick?.masculino;
        const femaleUrl = pick?.cewe || pick?.female || pick?.femenina;
        if (!maleUrl || !femaleUrl) continue;
        try {
          const [maleBuf, femaleBuf] = await Promise.all([
            getBuffer(maleUrl, { timeout: 15_000 }),
            getBuffer(femaleUrl, { timeout: 15_000 })
          ]);
          if (maleBuf?.length > 1000 && femaleBuf?.length > 1000) {
            return { maleBuf, femaleBuf };
          }
        } catch {}
      }
    } catch {}
  }

  // Fallback a Delirius
  try {
    const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
    const { data } = await axios.get(`${delirius}/anime/ppcouple`, { timeout: 15_000, headers: { 'User-Agent': DEFAULT_UA } });
    const d = data?.data || data?.result || data;
    const maleUrl = d?.cowo || d?.male;
    const femaleUrl = d?.cewe || d?.female;
    if (maleUrl && femaleUrl) {
      const [maleBuf, femaleBuf] = await Promise.all([getBuffer(maleUrl), getBuffer(femaleUrl)]);
      if (maleBuf?.length > 1000 && femaleBuf?.length > 1000) return { maleBuf, femaleBuf };
    }
  } catch {}

  return null;
}

export default {
  command: ['ppcp', 'ppcouple', 'pareja'],
  category: 'anime',
  description: 'Generar imágenes de perfil compartidas para parejas o amigos.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    try {
      const pair = await fetchCouplePair();
      if (!pair) {
        return msg.reply('《✧》 No se pudieron obtener las imágenes en este momento. Intenta de nuevo.');
      }
      await sock.sendMessage(msg.chat, { image: pair.maleBuf, caption: '*Masculino* ♂' }, { quoted: msg });
      await sock.sendMessage(msg.chat, { image: pair.femaleBuf, caption: '*Femenina* ♀' }, { quoted: msg });
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
