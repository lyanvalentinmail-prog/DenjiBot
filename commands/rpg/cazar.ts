import { rpgCommand, startCooldown, count, addItem, addXp, levelUpText, track, rand, chance, pick, lootText } from '../../lib/rpg.ts';

const prey = ['un ciervo', 'un jabalí', 'unos conejos', 'un faisán', 'un pato salvaje', 'un zorro'];

export default rpgCommand({
    command: ['cazar', 'hunt', 'caza'],
    description: 'Sal de caza por carne, cuero y plumas (cuidado: te pueden herir)',
    cooldown: 'cazar',
    alive: true,
    run: ({ p, px, reply }) => {
        const hasBow = count(p, 'arco') > 0;
        startCooldown(p, 'cazar');
        track(p, 'hunt');

        // A veces la presa se defiende; con arco pasa menos.
        let hurt = 0;
        if (chance(hasBow ? 0.08 : 0.22)) {
            hurt = Math.min(p.hp - 1, rand(10, 24));
            p.hp -= Math.max(0, hurt);
        }

        const loot: Record<string, number> = { carne: rand(1, 2) + (hasBow ? 1 : 0) };
        if (chance(hasBow ? 0.8 : 0.5)) loot.cuero = rand(1, 2);
        if (chance(0.4)) loot.pluma = rand(1, 3);
        if (chance(hasBow ? 0.16 : 0.07)) loot.colmillo = 1;
        if (p.job === 'cazador') loot.carne += 1;
        for (const [id, n] of Object.entries(loot)) addItem(p, id, n);

        const xp = rand(12, 20);
        const ups = addXp(p, xp);

        let text = `🏹 Cazaste ${pick(prey)} y conseguiste:\n\n✿ ${lootText(loot)}\n✿ *Experiencia* » +${xp}`;
        if (hurt > 0) text += `\n✿ La presa te hirió » -${hurt} ❤️`;
        if (!hasBow) text += `\n\n> Con un *arco* (*${px}comprar arco*) traes más botín y te hieren menos.`;
        return reply(text + levelUpText(p, ups));
    }
});
