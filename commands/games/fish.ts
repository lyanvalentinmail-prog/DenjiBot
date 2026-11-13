import { gameCommand } from '../../lib/games.ts';

export default gameCommand({
    game: 'fish',
    command: ['fish', 'pescar', 'pesca'],
    description: 'Pesca en el río dentro del chat; lo que atrapes va a tu inventario del RPG',
    usage: '[archivo]',
    how: px =>
        `✿ *Cómo se juega* » toca un lugar del río para lanzar la caña, espera a que el pez se acerque y toca justo cuando el anillo se cierre sobre el flotador.\n` +
        `✿ *Premio* » cada pez va a tu inventario: míralo con *${px}inventario*, véndelo con *${px}vender* o cocínalo con *${px}cocinar*.`
});
