function mapRange(text, upperBase, lowerBase, digitBase = null, overrides = {}) {
  let out = '';
  for (const ch of text) {
    if (overrides[ch]) {
      out += overrides[ch];
      continue;
    }
    const code = ch.codePointAt(0);
    if (upperBase && code >= 65 && code <= 90) {
      out += String.fromCodePoint(upperBase + (code - 65));
    } else if (lowerBase && code >= 97 && code <= 122) {
      out += String.fromCodePoint(lowerBase + (code - 97));
    } else if (digitBase && code >= 48 && code <= 57) {
      out += String.fromCodePoint(digitBase + (code - 48));
    } else {
      out += ch;
    }
  }
  return out;
}

const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
};

const CIRCLED_LOWER = 0x24d0;
const CIRCLED_UPPER = 0x24b6;

const FONTS = [
  ['Bold', s => mapRange(s, 0x1d400, 0x1d41a, 0x1d7ce)],
  ['Italic', s => mapRange(s, 0x1d434, 0x1d44e, null, { h: 'ℎ' })],
  ['Bold Italic', s => mapRange(s, 0x1d468, 0x1d482)],
  ['Script', s => mapRange(s, 0x1d4d0, 0x1d4ea)],
  ['Fraktur', s => mapRange(s, 0x1d56c, 0x1d586)],
  ['Double', s => mapRange(s, 0x1d538, 0x1d552, 0x1d7d8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' })],
  ['Sans Bold', s => mapRange(s, 0x1d5d4, 0x1d5ee, 0x1d7ec)],
  ['Sans Italic', s => mapRange(s, 0x1d608, 0x1d622)],
  ['Monospace', s => mapRange(s, 0x1d670, 0x1d68a, 0x1d7f6)],
  ['Small Caps', s => [...s].map(c => SMALL_CAPS[c.toLowerCase()] || c).join('')],
  ['Circled', s => mapRange(s, CIRCLED_UPPER, CIRCLED_LOWER)],
  ['Squared', s => [...s.toUpperCase()].map(c => {
    const k = c.charCodeAt(0);
    return k >= 65 && k <= 90 ? String.fromCodePoint(0x1f130 + (k - 65)) : c;
  }).join('')],
  ['Solid Box', s => [...s.toUpperCase()].map(c => {
    const k = c.charCodeAt(0);
    return k >= 65 && k <= 90 ? String.fromCodePoint(0x1f170 + (k - 65)) : c;
  }).join('')],
  ['Vaporwave', s => mapRange(s, 0xff21, 0xff41, 0xff10)],
  ['Subrayado', s => [...s].map(c => (c === ' ' ? ' ' : `${c}\u0332`)).join('')],
  ['Tachado', s => [...s].map(c => (c === ' ' ? ' ' : `${c}\u0336`)).join('')],
  ['Espaciado', s => [...s].join(' ')],
  ['Decorado', s => `『 ${mapRange(s, 0x1d400, 0x1d41a, 0x1d7ce)} 』`]
];

export default {
  command: ['styletext', 'fancy', 'letras'],
  category: 'utils',
  description: 'Convertir texto en fuentes estéticas listas para copiar.',
  run: async ({ msg, args, usedPrefix, command }) => {
    const input =
      args.join(' ').trim() ||
      String(msg.quoted?.text || msg.quoted?.caption || '').trim();

    if (!input) {
      return msg.reply(
        `《✧》 Escribe el texto que deseas estilizar.\n` +
        `> Ejemplo: *${usedPrefix + command} DenjiBot*`
      );
    }

    const clean = input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .slice(0, 80);

    const list = FONTS.map(([, fn], idx) => `*${idx + 1}.* ${fn(clean)}`).join('\n');
    await msg.reply(`✿ *Letras Estéticas*\n\n${list}`);
  }
};
