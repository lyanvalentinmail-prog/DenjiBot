import { rpgCommand, startCooldown, count, addItem, addXp, levelUpText, track, rand, chance, lootText } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['talar', 'chop', 'lenar', 'bosque'],
    description: 'Tala árboles para conseguir madera, manzanas y plumas',
    cooldown: 'talar',
    alive: true,
    run: ({ p, px, reply }) => {
        const hasAxe = count(p, 'hacha') > 0;
        let wood = rand(1, 3) * (hasAxe ? 2 : 1);
        if (p.job === 'lenador') wood *= 2;

        const loot: Record<string, number> = { madera: wood };
        if (chance(0.45)) loot.manzana = rand(1, 3);
        if (chance(0.2)) loot.pluma = rand(1, 2);
        for (const [id, n] of Object.entries(loot)) addItem(p, id, n);

        startCooldown(p, 'talar');
        track(p, 'chop');
        const xp = rand(8, 15);
        const ups = addXp(p, xp);

        let text = `🪓 Talaste en el bosque y conseguiste:\n\n✿ ${lootText(loot)}\n✿ *Experiencia* » +${xp}`;
        if (!hasAxe) text += `\n\n> Con un *hacha* (*${px}comprar hacha*) sacas el doble de madera.`;
        return reply(text + levelUpText(p, ups));
    }
});
