import { rpgCommand, ITEMS, RECIPES, count, takeItem, addItem, findItem, parseItemArgs, addXp, levelUpText, track, label } from '../../lib/rpg.ts';

const needs = (recipe: Record<string, number>, times = 1): string =>
    Object.entries(recipe).map(([id, n]) => `${ITEMS[id].emoji} ${ITEMS[id].name} ×${n * times}`).join(' + ');

export default rpgCommand({
    command: ['forjar', 'craft', 'fabricar', 'recetas'],
    description: 'Crea armas, armaduras, herramientas y pociones con tus materiales',
    usage: '[objeto] [cantidad]',
    run: ({ p, args, px, reply }) => {
        if (!args.length) {
            const lines = ['⚒️ *FORJA — Recetas*', ''];
            for (const [id, recipe] of Object.entries(RECIPES)) {
                const it = ITEMS[id];
                const ready = Object.entries(recipe).every(([key, n]) => count(p, key) >= n);
                const stats = [it.atk ? `+${it.atk} ataque` : '', it.def ? `+${it.def} defensa` : '', it.hp ? `+${it.hp} vida` : ''].filter(Boolean).join(', ');
                lines.push(`${ready ? '✅' : '▫️'} ${it.emoji} *${it.name}*${stats ? ` (${stats})` : ''}`, `> ${needs(recipe)}`);
            }
            lines.push('', `✿ ✅ = ya tienes los materiales.`, `> Crea uno con *${px}forjar <objeto>*`);
            return reply(lines.join('\n'));
        }

        const { query, amount } = parseItemArgs(args);
        const found = findItem(query, Object.keys(RECIPES).map(id => ITEMS[id]));
        if (!found.item) {
            if (found.options.length > 1) return reply(`✿ ¿Cuál de estos?\n\n${found.options.map(it => `› ${it.emoji} ${it.name}`).join('\n')}`);
            return reply(`✿ No hay receta para *${query}*.\n> Mira las recetas con *${px}forjar*`);
        }

        const it = found.item;
        const recipe = RECIPES[it.id];
        const possible = Math.min(...Object.entries(recipe).map(([id, n]) => Math.floor(count(p, id) / n)));
        const times = amount === 'all' ? possible : Math.min(amount, 99);

        if (possible < 1 || times > possible) {
            const missing = Object.entries(recipe)
                .filter(([id, n]) => count(p, id) < n * Math.max(1, times))
                .map(([id, n]) => `${ITEMS[id].emoji} ${ITEMS[id].name}: tienes ${count(p, id)} de ${n * Math.max(1, times)}`);
            return reply(`⚒️ Te faltan materiales para ${label(it.id, Math.max(1, times))}:\n\n${missing.join('\n')}`);
        }

        for (const [id, n] of Object.entries(recipe)) takeItem(p, id, n * times);
        addItem(p, it.id, times);
        track(p, 'craft', times);
        const ups = addXp(p, 25 * times);

        let text = `⚒️ Creaste ${label(it.id, times)}.\n\n✿ *Usaste* » ${needs(recipe, times)}`;
        if (it.type === 'arma' || it.type === 'armadura') text += `\n> Póntelo con *${px}equipar ${it.name.toLowerCase()}*`;
        return reply(text + levelUpText(p, ups));
    }
});
