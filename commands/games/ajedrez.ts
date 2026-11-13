import { gameCommand, CHESS_WIN_COINS, CHESS_DRAW_COINS } from '../../lib/games.ts';
import { coinName, fmt } from '../../lib/rpg.ts';

const FRESH_WORDS = new Set(['nueva', 'nuevo', 'new', 'reiniciar', 'reset']);

export default gameCommand({
    game: 'chess',
    command: ['ajedrez', 'chess'],
    description: 'Ajedrez dentro del chat: contra el bot (3 niveles), de a dos o en línea',
    usage: '[nueva] [archivo]',
    options: words => ({ fresh: words.some(word => FRESH_WORDS.has(word.toLowerCase())) }),
    how: px =>
        `✿ *Cómo se juega* » toca una pieza y luego la casilla. El botón del centro cambia el modo: bot fácil, medio o difícil, 2 jugadores en el mismo teléfono, o en línea (todos los que abran este mensaje mueven el mismo tablero).\n` +
        `✿ *Premio* » ganarle al bot da ${fmt(CHESS_WIN_COINS[1])}, ${fmt(CHESS_WIN_COINS[2])} o ${fmt(CHESS_WIN_COINS[3])} ${coinName()} según el nivel; tablas, ${fmt(CHESS_DRAW_COINS)}.\n` +
        `✿ *Partida guardada* » al volver a pedir *${px}ajedrez* sigues donde ibas. Para empezar de cero: *${px}ajedrez nueva*.`
});
