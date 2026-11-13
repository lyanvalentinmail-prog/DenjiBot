import { rpgCommand, count, takeItem, addItem, openChest, lootText, label, money } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['cofre', 'cofres', 'chest'],
    description: 'Abre un cofre de tu inventario',
    usage: '[raro] [cantidad]',
    run: ({ p, cu, args, px, reply }) => {
        const common = count(p, 'cofre');
        const rare = count(p, 'cofre_raro');
        if (!common && !rare) {
            return reply(`🎁 No tienes cofres.\n\n> Se consiguen venciendo guardianes en *${px}mazmorra*, al *${px}jefe* o con las *${px}misiones*.`);
        }

        const wantsRare = args.some(a => /^rar/i.test(a));
        const id = wantsRare || !common ? 'cofre_raro' : 'cofre';
        if (!count(p, id)) return reply(`✿ No tienes ${label(id)}. Tienes 🎁 ×${common} y 🧰 ×${rare}.`);

        const asked = args.find(a => /^\d+$/.test(a));
        const all = args.some(a => /^(todo|todos|all)$/i.test(a));
        const n = Math.min(count(p, id), all ? 20 : Math.max(1, Math.min(20, Number(asked) || 1)));

        let coins = 0;
        const loot: Record<string, number> = {};
        for (let i = 0; i < n; i++) {
            const prize = openChest(id);
            coins += prize.coins;
            for (const [key, amount] of Object.entries(prize.loot)) loot[key] = (loot[key] || 0) + amount;
        }
        takeItem(p, id, n);
        cu.coins += coins;
        for (const [key, amount] of Object.entries(loot)) addItem(p, key, amount);

        const rest = count(p, 'cofre') + count(p, 'cofre_raro');
        return reply(
            `${id === 'cofre_raro' ? '🧰' : '🎁'} Abriste ${label(id, n)} y dentro había:\n\n` +
            `✿ ${money(coins)}\n✿ ${lootText(loot)}` + (rest ? `\n\n> ${rest === 1 ? 'Te queda 1 cofre' : `Te quedan ${rest} cofres`}.` : ''));
    }
});
