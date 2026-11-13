import { rpgCommand, ITEMS, MAX_UPGRADE, upOf, count, takeItem, attackOf, defenseOf, maxHp, label, money, fmt } from '../../lib/rpg.ts';

/** Coste de subir de +level a +level+1: monedas y mineral (mejor mineral cuanto más alto). */
function upgradeCost(level: number, discount: boolean): { coins: number; ore: string; amount: number } {
    const ore = level < 3 ? 'hierro' : level < 6 ? 'oro' : 'diamante';
    const coins = Math.round(6000 * Math.pow(1.6, level) * (discount ? 0.75 : 1));
    return { coins, ore, amount: 2 + Math.floor(level / 2) };
}

export default rpgCommand({
    command: ['mejorar', 'upgrade', 'reforzar'],
    description: 'Refuerza el arma o la armadura que llevas puesta (hasta +10)',
    usage: 'arma | armadura',
    run: ({ p, cu, args, px, reply }) => {
        const smith = p.job === 'herrero';
        const what = (args[0] || '').toLowerCase();
        const isArmor = what.startsWith('armadura') || what.startsWith('def');
        const isWeapon = !isArmor && (what.startsWith('arma') || what.startsWith('espada') || what.startsWith('atk'));

        if (!isArmor && !isWeapon) {
            const row = (name: string, id: string, level: number) => {
                if (!id) return `✿ *${name}* » no llevas ninguna`;
                if (level >= MAX_UPGRADE) return `✿ *${name}* » ${label(id)} +${level} (máximo)`;
                const cost = upgradeCost(level, smith);
                return `✿ *${name}* » ${label(id)} +${level} → +${level + 1}\n> Cuesta ${fmt(cost.coins)} monedas y ${label(cost.ore, cost.amount)}`;
            };
            return reply(
                `⚒️ *MEJORAR EQUIPO*\n\n${row('Arma', p.weapon, upOf(p, p.weapon))}\n${row('Armadura', p.armor, upOf(p, p.armor))}\n\n` +
                `Cada mejora del arma da +2 de ataque; la de la armadura, +2 de defensa y +5 de vida. La mejora es de ese objeto y se conserva aunque te lo quites.\n\n` +
                `> *${px}mejorar arma* · *${px}mejorar armadura*`);
        }

        const id = isArmor ? p.armor : p.weapon;
        const level = upOf(p, id);
        if (!id) return reply(`✿ No llevas ${isArmor ? 'ninguna armadura' : 'ningún arma'} puesta.\n> Usa *${px}equipar* primero.`);
        if (level >= MAX_UPGRADE) return reply(`✿ ${label(id)} ya está al máximo (+${MAX_UPGRADE}).`);

        const cost = upgradeCost(level, smith);
        if (cu.coins < cost.coins || count(p, cost.ore) < cost.amount) {
            return reply(
                `⚒️ Para subir ${label(id)} a +${level + 1} necesitas:\n\n` +
                `✿ ${money(cost.coins)} (tienes ${fmt(cu.coins)})\n` +
                `✿ ${label(cost.ore, cost.amount)} (tienes ${count(p, cost.ore)})\n\n> El mineral se consigue con *${px}minar*.`);
        }

        cu.coins -= cost.coins;
        takeItem(p, cost.ore, cost.amount);
        p.up[id] = level + 1;

        return reply(
            `⚒️ ${label(id)} subió a *+${level + 1}*.\n\n` +
            `🗡️ *Ataque* » ${attackOf(p)}   🛡️ *Defensa* » ${defenseOf(p)}   ❤️ *Vida máx.* » ${maxHp(p)}\n` +
            `✿ *Gastaste* » ${fmt(cost.coins)} monedas y ${label(cost.ore, cost.amount)}` + (smith ? '\n> Descuento de herrero aplicado.' : ''));
    }
});
