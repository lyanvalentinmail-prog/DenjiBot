import { rpgCommand, FISH, ITEMS, startCooldown, count, addItem, addXp, levelUpText, track, weighted, rand, chance, label, fmt } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['lanzar', 'anzuelo', 'pescartexto'],
    description: 'Pesca rápida por texto (el juego completo es fish)',
    cooldown: 'lanzar',
    alive: true,
    run: ({ p, px, reply }) => {
        const hasRod = count(p, 'cana') > 0;
        startCooldown(p, 'lanzar');

        if (chance(hasRod ? 0.12 : 0.25)) {
            return reply(`🎣 Lanzaste el anzuelo... y el pez se escapó.\n\n> Prueba el juego completo con *${px}fish*: ahí tú decides cuándo tirar.`);
        }

        // Sin caña solo pican los peces comunes.
        const pool = hasRod ? FISH : FISH.filter(f => ['bota', 'sardina', 'mojarra', 'bagre'].includes(f.id));
        const id = weighted(pool).id;
        addItem(p, id);
        if (id !== 'bota') track(p, 'fish');
        const xp = rand(8, 16);
        const ups = addXp(p, xp);

        let text = `🎣 Lanzaste el anzuelo y sacaste ${label(id, 1)}  _(vale ${fmt(ITEMS[id].sell)})_\n\n✿ *Experiencia* » +${xp}\n> Véndelo con *${px}vender peces* o ásalo con *${px}cocinar*.`;
        if (!hasRod) text += `\n> Con una *caña* (*${px}comprar caña*) pican peces más valiosos.`;
        return reply(text + levelUpText(p, ups));
    }
});
