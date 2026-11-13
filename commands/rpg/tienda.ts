import { rpgCommand, ITEMS, TYPE_LABELS, fmt, money } from '../../lib/rpg.ts';
import type { ItemType } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['tienda', 'shop', 'mercado'],
    description: 'Muestra lo que se puede comprar y sus precios',
    run: ({ cu, px, reply }) => {
        const lines = ['🏪 *TIENDA*'];
        for (const type of Object.keys(TYPE_LABELS) as ItemType[]) {
            const list = Object.values(ITEMS).filter(it => it.type === type && it.buy).sort((a, b) => a.buy! - b.buy!);
            if (!list.length) continue;
            lines.push('', `*${TYPE_LABELS[type]}*`);
            for (const it of list) {
                const stats = [
                    it.atk ? `+${it.atk} ataque` : '',
                    it.def ? `+${it.def} defensa` : '',
                    it.hp ? `+${it.hp} vida` : '',
                    it.heal ? (it.heal > 9000 ? 'cura todo' : `cura ${it.heal}`) : '',
                    it.note && !it.heal ? it.note : ''
                ].filter(Boolean).join(', ');
                lines.push(`${it.emoji} *${it.name}* — ${fmt(it.buy!)}`, `> ${stats}`);
            }
        }
        lines.push('', `✿ *Tus monedas* » ${money(cu.coins)}`, `> Compra con *${px}comprar <objeto> [cantidad]*`, `> El mejor equipo no se vende: se crea con *${px}forjar*`);
        return reply(lines.join('\n'));
    }
});
