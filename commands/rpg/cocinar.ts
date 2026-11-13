import { rpgCommand, ITEMS, cookResult, count, takeItem, addItem, findItem, parseItemArgs, healAmount, addXp, levelUpText, track, label } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['cocinar', 'cook', 'asar'],
    description: 'Asa carne o pescado: la comida cocinada cura mucho más',
    usage: '<ingrediente> [cantidad]',
    run: ({ p, args, px, reply }) => {
        const raw = Object.keys(p.inv).filter(id => count(p, id) > 0 && cookResult(id)).map(id => ITEMS[id]);

        if (!args.length) {
            if (!raw.length) return reply(`🍳 No tienes nada que cocinar.\n> Consigue carne con *${px}cazar* o peces con *${px}fish*.`);
            const list = raw.map(it => `› ${it.emoji} ${it.name} ×${count(p, it.id)} → ${label(cookResult(it.id)!)}`).join('\n');
            return reply(`🍳 *Puedes cocinar*\n\n${list}\n\n> Ejemplo » *${px}cocinar carne todo*`);
        }

        const { query, amount } = parseItemArgs(args);
        const found = findItem(query, raw);
        if (!found.item) {
            if (found.options.length > 1) return reply(`✿ ¿Cuál de estos?\n\n${found.options.map(it => `› ${it.emoji} ${it.name}`).join('\n')}`);
            return reply(`✿ No tienes *${query}* o no se puede cocinar.\n> Mira qué puedes cocinar con *${px}cocinar*`);
        }

        const it = found.item;
        const out = cookResult(it.id)!;
        const n = amount === 'all' ? count(p, it.id) : Math.min(amount, count(p, it.id));
        takeItem(p, it.id, n);
        addItem(p, out, n);
        track(p, 'craft', n);
        const ups = addXp(p, 6 * n);

        return reply(`🍳 Cocinaste ${label(it.id, n)} y obtuviste ${label(out, n)}.\n\n✿ Cada uno cura *${healAmount(p, out)}* de vida.\n> Cómelo con *${px}usar ${ITEMS[out].name.toLowerCase()}*` + levelUpText(p, ups));
    }
});
