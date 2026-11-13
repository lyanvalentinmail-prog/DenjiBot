import { rpgCommand, maxHp, money, fmt, bar } from '../../lib/rpg.ts';

const PRICE_PER_HP = 60;

export default rpgCommand({
    command: ['curar', 'heal', 'sanar', 'curandero'],
    description: 'Paga al curandero para recuperar toda tu vida',
    run: ({ p, cu, px, reply }) => {
        const top = maxHp(p);
        const missing = top - p.hp;
        if (missing <= 0) return reply(`❤️ Ya tienes la vida completa (${p.hp}/${top}).`);

        const cost = missing * PRICE_PER_HP;
        if (cu.coins < cost) {
            // Con lo que haya se cura lo que alcance.
            const points = Math.floor(cu.coins / PRICE_PER_HP);
            if (points < 1) return reply(`✿ El curandero cobra ${money(cost)} y no te alcanza.\n> Recupérate gratis con *${px}descansar*.`);
            cu.coins -= points * PRICE_PER_HP;
            p.hp += points;
            return reply(`⛑️ Solo te alcanzó para curar *${points}* de vida (${money(points * PRICE_PER_HP)}).\n\n❤️ *Vida* » ${p.hp}/${top}  ${bar(p.hp, top)}`);
        }

        cu.coins -= cost;
        p.hp = top;
        return reply(`⛑️ El curandero te dejó como nuevo por ${money(cost)}.\n\n❤️ *Vida* » ${p.hp}/${top}  ${bar(p.hp, top)}\n✿ *Te quedan* » ${fmt(cu.coins)}`);
    }
});
