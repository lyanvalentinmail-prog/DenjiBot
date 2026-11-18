import db from '#db';

const SESSIONS = new Map();
const TTL_MS = 5 * 60_000;
const MAX_ERRORS = 6;

const WORDS = [
  ['motosierra', 'Arma'], ['demonio', 'Fantasía'], ['katana', 'Arma'], ['samurai', 'Historia'],
  ['galaxia', 'Espacio'], ['cometa', 'Espacio'], ['nebulosa', 'Espacio'], ['planeta', 'Espacio'],
  ['tormenta', 'Clima'], ['relampago', 'Clima'], ['arcoiris', 'Clima'], ['huracan', 'Clima'],
  ['guitarra', 'Música'], ['melodia', 'Música'], ['orquesta', 'Música'], ['bateria', 'Música'],
  ['algoritmo', 'Tecnología'], ['teclado', 'Tecnología'], ['servidor', 'Tecnología'], ['internet', 'Tecnología'],
  ['laberinto', 'Aventura'], ['tesoro', 'Aventura'], ['brujula', 'Aventura'], ['castillo', 'Aventura'],
  ['dragon', 'Mitología'], ['fenix', 'Mitología'], ['quimera', 'Mitología'], ['valquiria', 'Mitología'],
  ['pantera', 'Animal'], ['tiburon', 'Animal'], ['colibri', 'Animal'], ['mapache', 'Animal'],
  ['camaleon', 'Animal'], ['pinguino', 'Animal'], ['leopardo', 'Animal'], ['mariposa', 'Animal'],
  ['chocolate', 'Comida'], ['empanada', 'Comida'], ['ramen', 'Comida'], ['helado', 'Comida'],
  ['esmeralda', 'Mineral'], ['diamante', 'Mineral'], ['obsidiana', 'Mineral'], ['zafiro', 'Mineral'],
  ['biblioteca', 'Lugar'], ['montana', 'Naturaleza'], ['cascada', 'Naturaleza'], ['volcan', 'Naturaleza'],
  ['horizonte', 'Naturaleza'], ['oceano', 'Naturaleza'], ['bosque', 'Naturaleza'], ['desierto', 'Naturaleza'],
  ['manga', 'Anime'], ['shinobi', 'Anime'], ['alquimia', 'Anime'], ['hechicero', 'Anime'],
  ['ajedrez', 'Juego'], ['enigma', 'Misterio'], ['espejismo', 'Fenómeno'], ['cronometro', 'Objeto']
];

const STAGES = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n=========```'
];

const clean = s =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function prune() {
  const now = Date.now();
  for (const [k, s] of SESSIONS) {
    if (now - s.updatedAt > TTL_MS) SESSIONS.delete(k);
  }
}

function maskWord(word, guessed) {
  return [...word].map(c => (guessed.has(c) ? c.toUpperCase() : '_')).join(' ');
}

function formatState(session, header = '✿ *Juego del Ahorcado*') {
  const wrong = [...session.wrong].map(c => c.toUpperCase()).join(', ') || 'ninguna';
  const lives = '❤️'.repeat(MAX_ERRORS - session.errors) + '🖤'.repeat(session.errors);
  return (
    `${header}\n` +
    `${STAGES[Math.min(session.errors, STAGES.length - 1)]}\n` +
    `│❀ *Palabra ::* \`${maskWord(session.word, session.guessed)}\`\n` +
    `│ꕥ *Pista ::* ${session.hint} _(${session.word.length} letras)_\n` +
    `│⚘ *Vidas ::* ${lives}\n` +
    `│○ *Fallos ::* ${wrong}\n\n` +
    `> Escribe una *letra*, la *palabra completa* o *rendirse*.`
  );
}

function rewardUser(chatId, userId, sock) {
  try {
    const chat = db.getChat(chatId);
    if (chat && chat.economy === false) return '';
    const prize = Math.floor(Math.random() * 2501) + 3500;
    const u = db.getChatUser(chatId, userId) || {};
    db.setChatUser(chatId, userId, 'coins', (u.coins || 0) + prize);
    const botId = (sock.user?.id || '').split('@')[0].split(':')[0] + '@s.whatsapp.net';
    const coin = db.getSettings(botId)?.currency || 'Yenes';
    return `\n> ❀ *Premio ::* +¥${prize.toLocaleString()} ${coin}`;
  } catch {
    return '';
  }
}

export async function before({ msg, sock }) {
  prune();
  const key = `${msg.chat}:${msg.sender}`;
  const session = SESSIONS.get(key);
  if (!session || msg.isBot) return false;

  const input = clean(msg.text || msg.body || '');
  if (!input || !/^[a-z]+$/.test(input)) return false;

  if (input === 'rendirse' || input === 'salir') {
    SESSIONS.delete(key);
    await msg.reply(`🏳️ Te rendiste. La palabra era *${session.word.toUpperCase()}*.`);
    return true;
  }

  // Solo aceptar una letra o un intento con la longitud exacta de la palabra.
  if (input.length !== 1 && input.length !== session.word.length) return false;

  session.updatedAt = Date.now();

  if (input.length > 1) {
    if (input === session.word) {
      for (const c of session.word) session.guessed.add(c);
      SESSIONS.delete(key);
      const bonus = rewardUser(msg.chat, msg.sender, sock);
      await msg.reply(
        `🎉 *¡Adivinaste la palabra!*\n` +
        `> ✦ *Palabra ::* *${session.word.toUpperCase()}*${bonus}`
      );
      return true;
    }
    session.errors++;
  } else {
    if (session.guessed.has(input) || session.wrong.has(input)) {
      await msg.reply(`《✧》 Ya probaste la letra *${input.toUpperCase()}*.`);
      return true;
    }
    if (session.word.includes(input)) {
      session.guessed.add(input);
    } else {
      session.wrong.add(input);
      session.errors++;
    }
  }

  const won = [...session.word].every(c => session.guessed.has(c));
  if (won) {
    SESSIONS.delete(key);
    const bonus = rewardUser(msg.chat, msg.sender, sock);
    await msg.reply(
      `🎉 *¡Ganaste en el Ahorcado!*\n` +
      `> ✦ *Palabra ::* *${session.word.toUpperCase()}*${bonus}`
    );
    return true;
  }

  if (session.errors >= MAX_ERRORS) {
    SESSIONS.delete(key);
    await msg.reply(
      `💀 *Fin del juego*\n${STAGES[MAX_ERRORS]}\n` +
      `> La palabra era *${session.word.toUpperCase()}*.`
    );
    return true;
  }

  await msg.reply(formatState(session));
  return true;
}

export default {
  command: ['ahorcado', 'hangman'],
  category: 'economy',
  description: 'Jugar al ahorcado adivinando la palabra oculta.',
  before,
  run: async ({ msg }) => {
    prune();
    const key = `${msg.chat}:${msg.sender}`;
    const existing = SESSIONS.get(key);
    if (existing) {
      return msg.reply(formatState(existing, '✿ *Tu partida actual de Ahorcado*'));
    }

    const [word, hint] = WORDS[Math.floor(Math.random() * WORDS.length)];
    const session = {
      word,
      hint,
      guessed: new Set(),
      wrong: new Set(),
      errors: 0,
      updatedAt: Date.now()
    };
    SESSIONS.set(key, session);
    await msg.reply(formatState(session));
  }
};
