import { rpgCommand, chatUser, savePlayer, ITEMS, count, takeItem, addItem, findItem, parseItemArgs, label } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['regalar', 'dar', 'gift', 'entregar'],
    description: 'Regala objetos de tu inventario a otra persona',
    usage: '@mención <objeto> [cantidad]',
    run: ({ chat, jid, p, args, px, reply, target }) => {
        const to = target();
        if (!to) return reply(`✿ Menciona a quién quieres regalarle algo.\n> Ejemplo » *${px}regalar @persona pocion 2*`);
        if (to === jid) return reply('✿ No puedes regalarte cosas a ti mismo.');

        const { query, amount } = parseItemArgs(args);
        const owned = Object.keys(p.inv).filter(id => ITEMS[id] && count(p, id) > 0).map(id => ITEMS[id]);
        const found = findItem(query, owned);
        if (!found.item) {
            if (found.options.length > 1) return reply(`✿ ¿Cuál de estos?\n\n${found.options.map(it => `› ${it.emoji} ${it.name}`).join('\n')}`);
            return reply(`✿ No tienes ${query ? `*${query}*` : 'ese objeto'}.\n> Revisa lo que llevas con *${px}inventario*.`);
        }

        const it = found.item;
        let have = count(p, it.id);
        if (it.id === p.weapon || it.id === p.armor) have -= 1;
        if (have <= 0) return reply(`✿ Solo tienes el ${it.emoji} *${it.name}* que llevas puesto.`);

        const n = amount === 'all' ? have : Math.min(amount, have);
        takeItem(p, it.id, n);
        addItem(chatUser(chat, to).rpg, it.id, n);
        savePlayer(chat, to);

        return reply(`🎁 Le regalaste ${label(it.id, n)} a @${to.split('@')[0]}.`, [to]);
    }
});
