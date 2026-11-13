import { gameCommand, ARENA_COINS } from '../../lib/games.ts';
import { coinName } from '../../lib/rpg.ts';

export default gameCommand({
    game: 'arena',
    command: ['arena', 'estrellas', 'multijugador'],
    description: 'Multijugador en vivo: corre por las estrellas contra la gente del chat',
    usage: '[código de sala] [archivo]',
    options: words => ({ room: words[0] || '' }),
    how: px =>
        `✿ *Cómo se juega* » mantén el dedo en la pista para moverte y llega a la estrella antes que los demás. Quien junte 10 gana la ronda.\n` +
        `✿ *Con quién* » todos los que pidan *${px}arena* en este chat entran a la misma sala. Para jugar con gente de otros chats usen el mismo código: *${px}arena AMIGOS*. Si no hay nadie, juegas contra bots.\n` +
        `✿ *Premio* » ${ARENA_COINS} ${coinName()} por estrella.`
});
