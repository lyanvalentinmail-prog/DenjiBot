import { rpgCommand, ITEMS, SELL_GROUPS, count, takeItem, findItem, parseItemArgs, sellPrice, track, label, money, fmt } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['vender', 'sell'],
    description: 'Vende objetos de tu inventario (peces, minerales, botín...)',
    usage: '<objeto> [cantidad] | todo | peces',
    run: ({ p, cu, args, px, reply }) => {
        if (!args.length) {
            return reply(
                `💰 *VENDER*\n\n` +
                `✿ *${px}vender salmon 3* » vende 3 salmones\n` +
                `✿ *${px}vender hierro todo* » vende todo tu hierro\n` +
                `✿ *${px}vender peces* » vende toda la pesca\n` +
                `✿ *${px}vender minerales* · *materiales* · *botin*\n` +
                `✿ *${px}vender todo* » vende pesca, minerales, materiales y botín\n\n` +
                `> El equipo, la comida y las pociones solo se venden por su nombre.\n> Mira lo que tienes con *${px}inventario*.`);
        }

        // Grupos: `.vender todo`, `.vender peces`...
        const group = SELL_GROUPS[args.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
        if (group) {
            const sold: string[] = [];
            let total = 0;
            for (const id of Object.keys(p.inv)) {
                const it = ITEMS[id];
                const n = count(p, id);
                if (!it || !n || !group.includes(it.type)) continue;
                total += sellPrice(p, id) * n;
                sold.push(label(id, n));
                takeItem(p, id, n);
            }
            if (!sold.length) return reply('✿ No tienes nada de eso para vender.');
            cu.coins += total;
            track(p, 'sell', total);
            return reply(`💰 *Venta realizada*\n\n${sold.join('\n')}\n\n✿ *Ganaste* » ${money(total)}\n✿ *Ahora tienes* » ${fmt(cu.coins)}`);
        }

        const { query, amount } = parseItemArgs(args);
        const owned = Object.keys(p.inv).filter(id => ITEMS[id] && count(p, id) > 0).map(id => ITEMS[id]);
        const found = findItem(query, owned);
        if (!found.item) {
            if (found.options.length > 1) {
                return reply(`✿ ¿Cuál de estos quieres vender?\n\n${found.options.map(it => `› ${it.emoji} ${it.name}`).join('\n')}`);
            }
            return reply(`✿ No tienes *${query}* en tu inventario.\n> Revisa lo que llevas con *${px}inventario*.`);
        }

        const it = found.item;
        let have = count(p, it.id);
        // El objeto equipado no se vende: hay que quitárselo antes.
        if (it.id === p.weapon || it.id === p.armor) have -= 1;
        if (have <= 0) return reply(`✿ Solo tienes el ${it.emoji} *${it.name}* que llevas puesto. Quítatelo con *${px}desequipar* si quieres venderlo.`);

        const n = amount === 'all' ? have : Math.min(amount, have);
        const total = sellPrice(p, it.id) * n;
        takeItem(p, it.id, n);
        cu.coins += total;
        track(p, 'sell', total);

        return reply(`💰 Vendiste ${label(it.id, n)} por ${money(total)}.\n\n✿ *Ahora tienes* » ${fmt(cu.coins)}`);
    }
});
