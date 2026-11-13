import config from '#config';
import { UserJid } from '#simple';
import { GAMES, recordsOf } from '../../lib/games.ts';

export default {
    command: ['juegos', 'minijuegos', 'games'],
    description: 'Lista de juegos que se abren dentro del chat y tus récords',
    category: 'games',
    run: async (ctx: any) => {
        const { sock, chat } = ctx;
        const m = ctx.m || ctx.msg;
        const px = ctx.usedPrefix || ctx.prefix || config.prefix || '.';
        const jid = (await UserJid(sock, chat, ctx.sender || m?.sender)) || ctx.sender || m?.sender || '';
        const r = recordsOf(jid);

        const records: Record<string, string> = {
            snake: `récord ${r.snake.best} · ${r.snake.apples} manzanas`,
            fish: `${r.fish.caught} capturas`,
            chess: `${r.chess.w} ganadas · ${r.chess.l} perdidas · ${r.chess.d} tablas`,
            arena: `${r.arena.stars} estrellas`
        };

        const lines = Object.values(GAMES).map(game =>
            `${game.emoji} *${px}${game.command}* — ${game.about}\n> Tú: ${records[game.id]}`);

        return sock.sendMessage(chat, {
            text:
                `🕹️ *JUEGOS*\n\n` +
                `Se abren dentro del chat, como el reloj de *${px}hora*. El progreso se guarda solo y lo que ganes va a tus monedas y a tu inventario del RPG.\n\n` +
                `${lines.join('\n\n')}\n\n` +
                `> ¿No se ve el juego en tu WhatsApp? Añade *archivo* (por ejemplo *${px}snake archivo*) y ábrelo en el navegador.\n` +
                `> Si el juego muestra un código, guárdalo con *${px}canjear código*.`
        }, { quoted: m });
    }
};
