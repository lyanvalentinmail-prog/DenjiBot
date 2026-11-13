import { rpgCommand, ITEMS, count, findItem, maxHp, attackOf, defenseOf, label } from '../../lib/rpg.ts';

const offWords = new Set(['desequipar', 'unequip']);

export default rpgCommand({
    command: ['equipar', 'equip', 'desequipar', 'unequip'],
    description: 'Ponte un arma o una armadura de tu inventario (desequipar la quita)',
    usage: '<arma o armadura>',
    run: ({ ctx, p, args, px, reply }) => {
        const stats = () => `🗡️ *Ataque* » ${attackOf(p)}   🛡️ *Defensa* » ${defenseOf(p)}   ❤️ *Vida máx.* » ${maxHp(p)}`;

        if (offWords.has(String(ctx.command || '').toLowerCase())) {
            const what = (args[0] || '').toLowerCase();
            const both = !what;
            const removed: string[] = [];
            if ((both || what.startsWith('arma') && !what.startsWith('armadura')) && p.weapon) { removed.push(label(p.weapon)); p.weapon = ''; }
            if ((both || what.startsWith('armadura')) && p.armor) { removed.push(label(p.armor)); p.armor = ''; }
            if (!removed.length) return reply('✿ No llevas nada puesto.');
            p.hp = Math.min(p.hp, maxHp(p));
            return reply(`✿ Te quitaste: ${removed.join(' y ')}.\n\n${stats()}`);
        }

        const gear = Object.keys(p.inv).filter(id => count(p, id) > 0 && ['arma', 'armadura'].includes(ITEMS[id]?.type)).map(id => ITEMS[id]);
        if (!args.length) {
            if (!gear.length) return reply(`✿ No tienes armas ni armaduras.\n> Compra en *${px}tienda* o crea las tuyas con *${px}forjar*.`);
            const list = gear.map(it => `› ${it.emoji} ${it.name}${it.id === p.weapon || it.id === p.armor ? ' _(equipado)_' : ''}`).join('\n');
            return reply(`⚔️ *Tu equipo*\n\n${list}\n\n> Ponte uno con *${px}equipar <nombre>*`);
        }

        const found = findItem(args.join(' '), gear);
        if (!found.item) {
            if (found.options.length > 1) return reply(`✿ ¿Cuál de estos?\n\n${found.options.map(it => `› ${it.emoji} ${it.name}`).join('\n')}`);
            return reply(`✿ No tienes ese equipo.\n> Mira lo que llevas con *${px}equipar*`);
        }

        const it = found.item;
        if (it.id === p.weapon || it.id === p.armor) return reply(`✿ Ya llevas puesto ${label(it.id)}.`);

        if (it.type === 'arma') p.weapon = it.id;
        else p.armor = it.id;
        p.hp = Math.min(p.hp, maxHp(p));

        return reply(`✿ Te equipaste ${label(it.id)}.\n\n${stats()}`);
    }
});
