import { rpgCommand, ITEMS, addItem, findItem, parseItemArgs, label, money, fmt } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['comprar', 'buy'],
    description: 'Compra un objeto de la tienda',
    usage: '<objeto> [cantidad]',
    run: ({ p, cu, args, px, reply }) => {
        if (!args.length) return reply(`✿ Dime qué quieres comprar.\n> Ejemplo » *${px}comprar pocion 2*\n> Mira los precios con *${px}tienda*`);

        const { query, amount } = parseItemArgs(args);
        const found = findItem(query, Object.values(ITEMS).filter(it => it.buy));
        if (!found.item) {
            if (found.options.length > 1) return reply(`✿ ¿Cuál de estos?\n\n${found.options.map(it => `› ${it.emoji} ${it.name} — ${fmt(it.buy!)}`).join('\n')}`);
            return reply(`✿ La tienda no vende *${query}*.\n> Mira lo que hay con *${px}tienda*`);
        }

        const it = found.item;
        const price = it.buy!;
        const n = amount === 'all' ? Math.floor(cu.coins / price) : Math.min(amount, 999);
        if (n < 1 || cu.coins < price * n) {
            return reply(`✿ No te alcanza: ${label(it.id, Math.max(1, n))} cuesta ${money(price * Math.max(1, n))} y tienes ${fmt(cu.coins)}.`);
        }

        cu.coins -= price * n;
        addItem(p, it.id, n);

        let text = `🛍️ Compraste ${label(it.id, n)} por ${money(price * n)}.\n\n✿ *Te quedan* » ${fmt(cu.coins)}`;
        if (it.type === 'arma' || it.type === 'armadura') text += `\n> Póntelo con *${px}equipar ${it.name.toLowerCase()}*`;
        if (it.heal) text += `\n> Úsalo con *${px}usar ${it.name.toLowerCase()}*`;
        return reply(text);
    }
});
