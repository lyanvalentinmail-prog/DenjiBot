import {
    rpgCommand, waitFor, startCooldown, timeLeft, addItem, addXp, levelUpText, track, fight, monsterFor, monsterLoot,
    maxHp, lootText, money, bar
} from '../../lib/rpg.ts';

const leaveWords = new Set(['salir', 'huir', 'retirarse', 'cobrar', 'exit']);

/*
 * La mazmorra es una partida de "seguir o retirarse": cada piso da más botín
 * y es más peligroso. Lo ganado solo es tuyo al salir; si caes, pierdes la mitad.
 */
export default rpgCommand({
    command: ['mazmorra', 'dungeon', 'dg', 'calabozo'],
    description: 'Baja por la mazmorra piso a piso; sal a tiempo para conservar el botín',
    usage: '[salir]',
    alive: true,
    run: ({ p, cu, args, px, reply }) => {
        const top = () => maxHp(p);
        const life = () => `❤️ *Vida* » ${p.hp}/${top()}  ${bar(p.hp, top())}`;
        const wantsOut = leaveWords.has((args[0] || '').toLowerCase());

        if (wantsOut) {
            if (!p.run) return reply(`✿ No estás dentro de la mazmorra.\n> Entra con *${px}mazmorra*.`);
            const run = p.run;
            p.run = null;
            cu.coins += run.coins;
            for (const [id, n] of Object.entries(run.loot)) addItem(p, id, n);
            startCooldown(p, 'mazmorra');
            const loot = lootText(run.loot);
            return reply(
                `🚪 Saliste de la mazmorra tras limpiar *${run.floor}* ${run.floor === 1 ? 'piso' : 'pisos'}.\n\n` +
                `✿ *Monedas* » ${money(run.coins)}\n` + (loot ? `✿ *Botín* » ${loot}\n` : '') + `\n${life()}`);
        }

        if (!p.run) {
            const left = waitFor(p, 'mazmorra');
            if (left > 0) return reply(`⏳ La mazmorra se está reorganizando. Vuelve en *${timeLeft(left)}*.`);
            p.run = { floor: 0, coins: 0, loot: {} };
        }

        const run = p.run;
        const floor = run.floor + 1;
        const monster = monsterFor(floor);
        const result = fight(p, monster);
        const head = `🏰 *MAZMORRA — Piso ${floor}*\n${monster.boss ? '👑 Guardián' : 'Enemigo'}: *${monster.name}*  (❤️ ${monster.hp} · 🗡️ ${monster.atk})\n\n`;

        if (!result.win) {
            // Derrota: se conserva la mitad de lo reunido en esta bajada.
            const coins = Math.floor(run.coins / 2);
            const kept: Record<string, number> = {};
            for (const [id, n] of Object.entries(run.loot)) if (Math.floor(n / 2) > 0) kept[id] = Math.floor(n / 2);
            cu.coins += coins;
            for (const [id, n] of Object.entries(kept)) addItem(p, id, n);
            p.run = null;
            p.deaths++;
            startCooldown(p, 'mazmorra');
            const loot = lootText(kept);
            return reply(
                head + `💀 Caíste en el turno ${result.rounds}. Te sacaron a rastras y perdiste la mitad del botín.\n\n` +
                `✿ *Conservaste* » ${money(coins)}${loot ? ` y ${loot}` : ''}\n\n` +
                `> Recupérate con *${px}descansar*, *${px}curar* o *${px}usar pocion*.`);
        }

        const prize = monsterLoot(floor, !!monster.boss);
        run.floor = floor;
        run.coins += prize.coins;
        for (const [id, n] of Object.entries(prize.loot)) run.loot[id] = (run.loot[id] || 0) + n;
        p.kills++;
        p.best = Math.max(p.best, floor);
        track(p, 'kills');
        const ups = addXp(p, 20 + floor * 10);
        const drop = lootText(prize.loot);
        const all = lootText(run.loot);

        return reply(
            head +
            `⚔️ ¡Victoria en ${result.rounds} turnos!${result.crits ? ` (${result.crits} ${result.crits === 1 ? 'golpe crítico' : 'golpes críticos'})` : ''}\n` +
            `✿ *Daño recibido* » ${result.taken}\n` +
            `✿ *Ganaste* » ${money(prize.coins)}${drop ? ` y ${drop}` : ''}\n\n` +
            `${life()}\n` +
            `🎒 *Botín de esta bajada* » ${money(run.coins)}${all ? `, ${all}` : ''}` +
            levelUpText(p, ups) + '\n\n' +
            `> *${px}mazmorra* » bajar al piso ${floor + 1}${(floor + 1) % 5 === 0 ? ' (¡guardián!)' : ''}\n` +
            `> *${px}mazmorra salir* » irte con el botín\n` +
            `> Si caes pierdes la mitad. Puedes curarte antes con *${px}usar pocion*.`);
    }
});
