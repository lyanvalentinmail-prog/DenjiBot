import db from '#db';

const GAMES = new Map();
const GAME_TTL = 5 * 60_000;
const NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function pruneExpired() {
  const now = Date.now();
  for (const [k, g] of GAMES) {
    if (now - g.updatedAt > GAME_TTL) GAMES.delete(k);
  }
}

function checkWinner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

function renderBoard(board) {
  const cell = i => (board[i] === 'X' ? '❌' : board[i] === 'O' ? '⭕' : NUM_EMOJI[i]);
  return [
    `${cell(0)}${cell(1)}${cell(2)}`,
    `${cell(3)}${cell(4)}${cell(5)}`,
    `${cell(6)}${cell(7)}${cell(8)}`
  ].join('\n');
}

function pickBotMove(board) {
  // 1) Ganar si es posible
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = 'O';
    const win = checkWinner(board) === 'O';
    board[i] = null;
    if (win) return i;
  }
  // 2) Bloquear victoria del jugador (85% de las veces para que sea divertido y ganable)
  if (Math.random() < 0.85) {
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = 'X';
      const threat = checkWinner(board) === 'X';
      board[i] = null;
      if (threat) return i;
    }
  }
  // 3) Centro, esquinas, lados
  if (!board[4]) return 4;
  const corners = [0, 2, 6, 8].filter(i => !board[i]);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  const free = board.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
  return free[Math.floor(Math.random() * free.length)];
}

function addCoins(chatId, userId, amount) {
  try {
    const chat = db.getChat(chatId);
    if (chat && chat.economy === false) return 0;
    const u = db.getChatUser(chatId, userId) || {};
    db.setChatUser(chatId, userId, 'coins', (u.coins || 0) + amount);
    return amount;
  } catch {
    return 0;
  }
}

function currencyOf(sock) {
  const botId = (sock.user?.id || '').split('@')[0].split(':')[0] + '@s.whatsapp.net';
  return db.getSettings(botId)?.currency || 'Yenes';
}

export async function before({ msg, sock }) {
  pruneExpired();
  const game = GAMES.get(msg.chat);
  if (!game || msg.isBot) return false;

  const raw = String(msg.text || msg.body || '').trim().toLowerCase();
  if (!raw) return false;

  const isPlayer = msg.sender === game.playerX || msg.sender === game.playerO;
  if (!isPlayer) return false;

  if (['salir', 'rendirse', 'surrender'].includes(raw)) {
    GAMES.delete(msg.chat);
    await sock.reply(
      msg.chat,
      `🏳️ @${msg.sender.split('@')[0]} abandonó la partida de *Tres en Raya*.`,
      msg,
      { mentions: [msg.sender] }
    );
    return true;
  }

  if (!/^[1-9]$/.test(raw)) return false;

  const expected = game.turn === 'X' ? game.playerX : game.playerO;
  if (msg.sender !== expected) {
    await msg.reply('《✧》 Aún no es tu turno.');
    return true;
  }

  const idx = Number(raw) - 1;
  if (game.board[idx]) {
    await msg.reply('《✧》 Esa casilla ya está ocupada. Elige un número libre del 1 al 9.');
    return true;
  }

  game.board[idx] = game.turn;
  game.updatedAt = Date.now();
  const coin = currencyOf(sock);

  let status = checkWinner(game.board);
  if (!status && game.vsBot) {
    const botIdx = pickBotMove(game.board);
    if (botIdx >= 0) game.board[botIdx] = 'O';
    status = checkWinner(game.board);
  }

  if (status) {
    GAMES.delete(msg.chat);
    if (status === 'draw') {
      const bonus = addCoins(msg.chat, game.playerX, 1500);
      if (!game.vsBot && game.playerO) addCoins(msg.chat, game.playerO, 1500);
      await sock.sendMessage(
        msg.chat,
        {
          text:
            `✿ *Tres en Raya — ¡Empate!*\n\n${renderBoard(game.board)}` +
            (bonus ? `\n\n> ❀ Recompensa: *+¥${bonus.toLocaleString()} ${coin}*` : '')
        },
        { quoted: msg }
      );
      return true;
    }

    if (game.vsBot && status === 'O') {
      await sock.sendMessage(
        msg.chat,
        { text: `✿ *Tres en Raya — Ganó el Bot* ⭕\n\n${renderBoard(game.board)}` },
        { quoted: msg }
      );
      return true;
    }

    const winner = status === 'X' ? game.playerX : game.playerO;
    const prize = addCoins(msg.chat, winner, game.vsBot ? 4000 : 6000);
    await sock.sendMessage(
      msg.chat,
      {
        text:
          `✿ *Tres en Raya — ¡Victoria!* ${status === 'X' ? '❌' : '⭕'}\n\n` +
          `${renderBoard(game.board)}\n\n` +
          `> 🏆 *Ganador ::* @${winner.split('@')[0]}` +
          (prize ? `\n> ❀ *Premio ::* +¥${prize.toLocaleString()} ${coin}` : ''),
        mentions: [winner]
      },
      { quoted: msg }
    );
    return true;
  }

  game.turn = game.vsBot ? 'X' : (game.turn === 'X' ? 'O' : 'X');
  const nextPlayer = game.turn === 'X' ? game.playerX : game.playerO;
  const symbol = game.turn === 'X' ? '❌' : '⭕';

  await sock.sendMessage(
    msg.chat,
    {
      text:
        `✿ *Tres en Raya*\n\n${renderBoard(game.board)}\n\n` +
        `> ${symbol} Turno de @${nextPlayer.split('@')[0]} _(escribe 1–9 o *rendirse*)_`,
      mentions: [nextPlayer]
    },
    { quoted: msg }
  );
  return true;
}

export default {
  command: ['ttt', 'tictactoe', 'gato', 'delttt'],
  category: 'economy',
  description: 'Jugar tres en raya contra un amigo o contra el bot.',
  before,
  run: async ({ msg, sock, usedPrefix, command }) => {
    pruneExpired();

    if (command === 'delttt') {
      if (!GAMES.has(msg.chat)) {
        return msg.reply('《✧》 No hay ninguna partida activa en este chat.');
      }
      GAMES.delete(msg.chat);
      return msg.reply('✿ Partida de *Tres en Raya* finalizada.');
    }

    if (GAMES.has(msg.chat)) {
      return msg.reply(
        `《✧》 Ya hay una partida en curso en este chat.\n` +
        `> Escribe un número del *1 al 9* para jugar o *${usedPrefix}delttt* para cancelarla.`
      );
    }

    const rival = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    const botNum = (sock.user?.id || '').split('@')[0].split(':')[0];
    const rivalNum = rival ? rival.split('@')[0].split(':')[0] : '';
    const vsBot = !rival || rival === msg.sender || rivalNum === botNum;

    const game = {
      board: Array(9).fill(null),
      playerX: msg.sender,
      playerO: vsBot ? null : rival,
      vsBot,
      turn: 'X',
      updatedAt: Date.now()
    };
    GAMES.set(msg.chat, game);

    const mentions = vsBot ? [msg.sender] : [msg.sender, rival];
    const header = vsBot
      ? `│❌ @${msg.sender.split('@')[0]}\n│⭕ *Bot (IA)*`
      : `│❌ @${msg.sender.split('@')[0]}\n│⭕ @${rival.split('@')[0]}`;

    await sock.sendMessage(
      msg.chat,
      {
        text:
          `✿ *Tres en Raya iniciado*\n\n${header}\n\n${renderBoard(game.board)}\n\n` +
          `> ❌ Turno de @${msg.sender.split('@')[0]} — responde con un número del *1 al 9* _(o *rendirse*)_`,
        mentions
      },
      { quoted: msg }
    );
  }
};
