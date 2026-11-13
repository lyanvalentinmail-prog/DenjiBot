import { rpgCommand, startCooldown, count, addItem, addXp, levelUpText, track, weighted, rand, lootText } from '../../lib/rpg.ts';

// Sin pico solo se saca piedra y carbón; con pico aparecen los metales y las gemas.
const BARE = [{ id: 'piedra', weight: 70 }, { id: 'carbon', weight: 30 }];
const PICK = [
    { id: 'piedra', weight: 30 }, { id: 'carbon', weight: 28 }, { id: 'hierro', weight: 24 },
    { id: 'oro', weight: 11 }, { id: 'diamante', weight: 5 }, { id: 'esmeralda', weight: 2 }
];

export default rpgCommand({
    command: ['minar', 'mine', 'mina'],
    description: 'Baja a la mina a buscar minerales (con pico encuentras oro y gemas)',
    cooldown: 'minar',
    alive: true,
    run: ({ p, px, reply }) => {
        const hasPick = count(p, 'pico') > 0;
        const rolls = (hasPick ? rand(2, 4) : rand(1, 3)) + (p.job === 'minero' ? 1 : 0);
        const loot: Record<string, number> = {};
        for (let i = 0; i < rolls; i++) {
            const id = weighted(hasPick ? PICK : BARE).id;
            loot[id] = (loot[id] || 0) + (id === 'piedra' || id === 'carbon' ? rand(1, 2) : 1);
        }
        for (const [id, n] of Object.entries(loot)) addItem(p, id, n);

        startCooldown(p, 'minar');
        track(p, 'mine');
        const xp = rand(10, 18);
        const ups = addXp(p, xp);

        let text = `⛏️ Picaste en la mina y encontraste:\n\n✿ ${lootText(loot)}\n✿ *Experiencia* » +${xp}`;
        if (!hasPick) text += `\n\n> Con un *pico* (*${px}comprar pico*) encontrarás hierro, oro y diamantes.`;
        return reply(text + levelUpText(p, ups));
    }
});
