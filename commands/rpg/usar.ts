import { rpgCommand, ITEMS, count, takeItem, findItem, parseItemArgs, healAmount, maxHp, label, bar } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['usar', 'use', 'consumir', 'beber'],
    description: 'Usa una poción o come algo para recuperar vida',
    usage: '<objeto> [cantidad]',
    run: ({ p, args, px, reply }) => {
        const usable = Object.keys(p.inv).filter(id => count(p, id) > 0 && ITEMS[id]?.heal).map(id => ITEMS[id]);

        if (!args.length) {
            if (!usable.length) return reply(`✿ No tienes comida ni pociones.\n> Compra en *${px}tienda* o cocina con *${px}cocinar*.`);
            const list = usable.map(it => `› ${it.emoji} ${it.name} ×${count(p, it.id)} — cura ${healAmount(p, it.id) > 9000 ? 'todo' : healAmount(p, it.id)}`).join('\n');
            return reply(`🧪 *Puedes usar*\n\n${list}\n\n> Ejemplo » *${px}usar pocion*`);
        }

        const { query, amount } = parseItemArgs(args);
        const found = findItem(query, usable);
        if (!found.item) {
            if (found.options.length > 1) return reply(`✿ ¿Cuál de estos?\n\n${found.options.map(it => `› ${it.emoji} ${it.name}`).join('\n')}`);
            if (ITEMS[findItem(query).item?.id || '']?.type === 'cofre') return reply(`✿ Los cofres se abren con *${px}cofre*.`);
            return reply(`✿ No tienes *${query}* o no se puede usar.\n> Mira qué puedes usar con *${px}usar*`);
        }

        const it = found.item;
        const top = maxHp(p);
        if (p.hp >= top) return reply(`❤️ Ya tienes la vida completa (${p.hp}/${top}).`);

        // Solo se gastan las unidades que hacen falta para llenar la vida.
        const each = healAmount(p, it.id);
        const needed = Math.ceil((top - p.hp) / each);
        const n = Math.min(amount === 'all' ? needed : amount, needed, count(p, it.id));
        const before = p.hp;
        takeItem(p, it.id, n);
        p.hp = Math.min(top, p.hp + each * n);

        return reply(`${it.emoji} Usaste ${label(it.id, n)} y recuperaste *${p.hp - before}* de vida.\n\n❤️ *Vida* » ${p.hp}/${top}  ${bar(p.hp, top)}`);
    }
});
