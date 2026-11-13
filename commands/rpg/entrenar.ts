import { rpgCommand, startCooldown, attackOf, addXp, levelUpText, money, fmt } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['entrenar', 'train', 'entrenamiento'],
    description: 'Paga un entrenamiento para subir tu ataque para siempre',
    cooldown: 'entrenar',
    alive: true,
    run: ({ p, cu, px, reply }) => {
        // La fuerza entrenada no puede pasar del triple del nivel.
        const cap = p.lvl * 3;
        if (p.str >= cap) return reply(`🥋 Ya entrenaste todo lo que tu nivel permite (+${p.str}).\n> Sube de nivel para seguir entrenando.`);

        const cost = 4000 + p.str * 2500;
        if (cu.coins < cost) return reply(`✿ El maestro cobra ${money(cost)} por esta sesión y tienes ${fmt(cu.coins)}.\n> Gana monedas con *${px}trabajar*.`);

        cu.coins -= cost;
        p.str += 1;
        startCooldown(p, 'entrenar');
        const ups = addXp(p, 20);

        return reply(`🥋 Entrenaste con el maestro por ${money(cost)}.\n\n✿ *Fuerza* » +${p.str} (máx. ${cap})\n🗡️ *Ataque* » ${attackOf(p)}` + levelUpText(p, ups));
    }
});
