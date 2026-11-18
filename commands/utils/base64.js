const MORSE_MAP = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--',
  '-': '-....-', '/': '-..-.', '@': '.--.-.', ' ': '/'
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE_MAP).map(([k, v]) => [v, k]));

function toMorse(text) {
  const clean = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return [...clean].map(c => MORSE_MAP[c] || '').filter(Boolean).join(' ');
}

function fromMorse(code) {
  return code
    .trim()
    .split(/\s+/)
    .map(tok => (tok === '/' ? ' ' : MORSE_REV[tok] || '?'))
    .join('');
}

function toBinary(text) {
  return [...Buffer.from(text, 'utf8')].map(b => b.toString(2).padStart(8, '0')).join(' ');
}

function fromBinary(bits) {
  const clean = bits.replace(/\s+/g, '');
  if (!clean || !/^[01]+$/.test(clean) || clean.length % 8 !== 0) {
    throw new Error('Secuencia binaria no válida (usa grupos de 8 bits de 0 y 1)');
  }
  const bytes = [];
  for (let i = 0; i < clean.length; i += 8) {
    bytes.push(parseInt(clean.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes).toString('utf8');
}

export default {
  command: ['base64', 'morse', 'binario'],
  category: 'utils',
  description: 'Codificar o decodificar texto en Base64, Morse o binario.',
  run: async ({ msg, args, usedPrefix, command }) => {
    let action = 'auto';
    const rest = [...args];
    const first = (rest[0] || '').toLowerCase();

    if (['enc', 'encode', 'codificar', 'e'].includes(first)) {
      action = 'encode';
      rest.shift();
    } else if (['dec', 'decode', 'decodificar', 'd'].includes(first)) {
      action = 'decode';
      rest.shift();
    }

    const input = rest.join(' ').trim() || String(msg.quoted?.text || '').trim();
    if (!input) {
      return msg.reply(
        `《✧》 Ingresa el texto a convertir.\n` +
        `> Codificar: *${usedPrefix + command} Hola mundo*\n` +
        `> Decodificar: *${usedPrefix + command} dec <código>*`
      );
    }

    try {
      let out = '';
      let modeLabel = '';

      if (command === 'morse') {
        const isDecode = action === 'decode' || (action === 'auto' && /^[.\-/\s]+$/.test(input));
        out = isDecode ? fromMorse(input) : toMorse(input);
        modeLabel = isDecode ? 'Morse → Texto' : 'Texto → Morse';
      } else if (command === 'binario') {
        const isDecode = action === 'decode' || (action === 'auto' && /^[01\s]+$/.test(input) && input.replace(/\s+/g, '').length >= 8);
        out = isDecode ? fromBinary(input) : toBinary(input);
        modeLabel = isDecode ? 'Binario → Texto' : 'Texto → Binario';
      } else {
        const isDecode = action === 'decode';
        if (isDecode) {
          const compact = input.replace(/\s+/g, '');
          if (!/^[A-Za-z0-9+/=_-]+$/.test(compact)) {
            return msg.reply('《✧》 La cadena ingresada no es Base64 válido.');
          }
          out = Buffer.from(compact, 'base64').toString('utf8');
          modeLabel = 'Base64 → Texto';
        } else {
          out = Buffer.from(input, 'utf8').toString('base64');
          modeLabel = 'Texto → Base64';
        }
      }

      if (!out.trim()) {
        return msg.reply('《✧》 No se obtuvo un resultado válido.');
      }

      await msg.reply(`✿ *${modeLabel}*\n\n${out.slice(0, 3900)}`);
    } catch (e) {
      await msg.reply(`《✧》 Error al convertir: *${e.message}*.`);
    }
  }
};
