import config from '#config';
import { GAMES, redeemCode } from '../../lib/games.ts';
import { coinName, fmt, label } from '../../lib/rpg.ts';

export default {
    command: ['canjear', 'redeem', 'guardarjuego'],
    description: 'Guarda a mano el progreso de un juego con el código que muestra la pantalla',
    usage: '<código>',
    category: 'games',
    run: async (ctx: any) => {
        const { sock, chat } = ctx;
        const m = ctx.m || ctx.msg;
        const px = ctx.usedPrefix || ctx.prefix || config.prefix || '.';
        const reply = (text: string) => sock.sendMessage(chat, { text }, { quoted: m });

        const code = (Array.isArray(ctx.args) ? ctx.args : []).join('').trim();
        if (!code) {
            return reply(
                `✿ Escribe el código que te muestra el juego.\n\n` +
                `> Ejemplo: *${px}canjear ABC1234-1F.2-X9K2P*\n` +
                `> El código solo aparece cuando el juego no pudo guardar solo.`);
        }

        const result = redeemCode(code);
        if (!result.ok) {
            const why = result.reason === 'format' ? 'Ese código no tiene el formato correcto. Cópialo tal cual aparece en el juego.'
                : result.reason === 'unknown' ? `Esa partida ya no existe (duran 48 horas). Pide un juego nuevo, por ejemplo *${px}snake*.`
                : 'El código no es válido. Revisa que esté completo.';
            return reply(`✿ ${why}`);
        }

        const { session, credit } = result;
        const info = GAMES[session.g];
        if (!credit.changed) {
            return reply(`${info.emoji} *${info.name}* » ese progreso de *${session.n}* ya estaba guardado; no hay nada nuevo.`);
        }

        const lines = [`${info.emoji} *${info.name}* » progreso de *${session.n}* guardado.`, ''];
        if (credit.coins) lines.push(`✿ *Monedas* » +${fmt(credit.coins)} ${coinName()}`);
        const items = Object.entries(credit.items);
        if (items.length) lines.push(`✿ *Al inventario* » ${items.map(([id, amount]) => label(id, amount)).join(', ')}`);
        for (const note of credit.notes) lines.push(note);
        // Lo que no pasó el límite por tiempo de juego se queda fuera.
        if (!credit.coins && !items.length && !credit.notes.length) lines.push('✿ Se actualizó la partida.');
        return reply(lines.join('\n'));
    }
};
