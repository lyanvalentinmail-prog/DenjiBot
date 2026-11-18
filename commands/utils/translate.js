async function googleTranslate(text, targetLang = 'es') {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto` +
    `&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.[0])) throw new Error('Respuesta inválida del traductor.');
  const translated = data[0]
    .map(part => (Array.isArray(part) ? part[0] : ''))
    .join('')
    .trim();
  if (!translated) throw new Error('No se obtuvo traducción.');
  return translated;
}

export default {
  command: ['translate', 'trad', 'traducir'],
  category: 'utils',
  description: 'Traducir texto al idioma especificado.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const defaultLang = 'es';
    if (!args[0] && !msg.quoted) {
      return msg.reply('《✧》 Ingresa el idioma seguido del texto que quieras traducir.');
    }
    let lang = (args[0] || '').toLowerCase();
    let text = '';
    const isLangCode = /^[a-z]{2}(?:-[a-z]{2})?$/i.test(lang);
    if (msg.quoted) {
      text = msg.quoted.text || msg.quoted.caption || msg.quoted.body || '';
      if (isLangCode && args[1]) {
        text = args.slice(1).join(' ') || text;
      } else if (!isLangCode) {
        lang = defaultLang;
        text = args.join(' ') || text;
      }
    } else if (isLangCode && args.length > 1) {
      text = args.slice(1).join(' ');
    } else {
      lang = defaultLang;
      text = args.join(' ');
    }
    if (!text.trim()) {
      return msg.reply('《✧》 No hay texto para traducir.');
    }
    try {
      await msg.react('🕒');
      const translated = await googleTranslate(text, lang);
      await sock.sendMessage(msg.chat, { text: translated }, { quoted: msg });
      await msg.react('✔️');
    } catch (e) {
      await msg.react('✖️');
      await msg.reply(`> Ocurrió un error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
