import { rpgCommand, chatUser, ITEMS, TYPE_LABELS, count, sellPrice, fmt, money, displayName } from '../../lib/rpg.ts';
import type { ItemType } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['inventario', 'inv', 'mochila', 'inventory'],
    description: 'Muestra los objetos que llevas y cuánto valen',
    usage: '[@mención]',
    run: ({ chat, jid, px, reply, target }) => {
        const who = target() || jid;
        const p = chatUser(chat, who).rpg;
        const owned = Object.keys(p.inv).filter(id => ITEMS[id] && count(p, id) > 0);

        if (!owned.length) {
            return reply(
                `🎒 *INVENTARIO* » ${displayName(who)}\n\nLa mochila está vacía.\n\n` +
                `> Consigue objetos con *${px}minar*, *${px}talar*, *${px}cazar*, *${px}fish* o *${px}mazmorra*.`);
        }

        const lines = [`🎒 *INVENTARIO* » ${displayName(who)}`];
        let total = 0;

        for (const type of Object.keys(TYPE_LABELS) as ItemType[]) {
            const ids = owned.filter(id => ITEMS[id].type === type).sort((a, b) => ITEMS[b].sell - ITEMS[a].sell);
            if (!ids.length) continue;
            lines.push('', `*${TYPE_LABELS[type]}*`);
            for (const id of ids) {
                const n = count(p, id);
                const value = sellPrice(p, id) * n;
                total += value;
                const equipped = id === p.weapon || id === p.armor ? ' _(equipado)_' : '';
                lines.push(`${ITEMS[id].emoji} ${ITEMS[id].name} ×${n}${equipped} — ${fmt(value)}`);
            }
        }

        lines.push('', `✿ *Valor total* » ${money(total)}`, `> Vende con *${px}vender <objeto> [cantidad]* o *${px}vender todo*`);
        return reply(lines.join('\n'), who === jid ? undefined : [who]);
    }
});
