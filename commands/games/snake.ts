import { gameCommand, SNAKE_COINS } from '../../lib/games.ts';
import { coinName } from '../../lib/rpg.ts';

export default gameCommand({
    game: 'snake',
    command: ['snake', 'culebrita', 'serpiente'],
    description: 'Snake dentro del chat: come manzanas y gana monedas',
    usage: '[archivo]',
    how: () =>
        `✿ *Cómo se juega* » toca el tablero para empezar y muévete con las flechas o deslizando el dedo.\n` +
        `✿ *Premio* » ${SNAKE_COINS} ${coinName()} por cada manzana. Tu récord queda guardado.`
});
