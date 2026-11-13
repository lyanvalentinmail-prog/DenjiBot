import {
    rpgCommand, startCooldown, addItem, addXp, levelUpText, track, rand, chance, pick, fight, monsterFor,
    maxHp, label, lootText, money, bar
} from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['aventura', 'adventure', 'explorar', 'aventurar'],
    description: 'Sal a explorar: puedes hallar tesoros, monstruos o trampas',
    cooldown: 'aventura',
    alive: true,
    run: ({ p, cu, reply }) => {
        startCooldown(p, 'aventura');
        track(p, 'adventure');
        const roll = Math.random();
        // La vida máxima se lee al escribir: subir de nivel la cambia.
        const life = () => `\n\n❤️ *Vida* » ${p.hp}/${maxHp(p)}  ${bar(p.hp, maxHp(p))}`;

        // Tesoro.
        if (roll < 0.28) {
            const coins = Math.round(rand(3000, 11000) * (1 + (p.lvl - 1) * 0.05));
            cu.coins += coins;
            const ups = addXp(p, rand(15, 25));
            return reply(`🗺️ ${pick(['Seguiste un mapa viejo hasta un cofre enterrado', 'Hallaste una bolsa olvidada en unas ruinas', 'Un viajero agradecido te recompensó'])}: ${money(coins)}.` + levelUpText(p, ups));
        }

        // Objetos.
        if (roll < 0.5) {
            const loot: Record<string, number> = {};
            const id = pick(['pocion', 'hierro', 'madera', 'manzana', 'cuero', 'oro', 'pan', 'hueso']);
            loot[id] = rand(1, 3);
            if (chance(0.12)) loot.cofre = 1;
            for (const [key, n] of Object.entries(loot)) addItem(p, key, n);
            const ups = addXp(p, rand(12, 22));
            return reply(`🎒 Explorando una cueva encontraste: ${lootText(loot)}.` + levelUpText(p, ups));
        }

        // Monstruo acorde al nivel.
        if (roll < 0.82) {
            const floor = Math.max(1, Math.round(p.lvl * 0.8) + rand(-1, 1));
            const monster = monsterFor(floor % 5 === 0 ? floor + 1 : floor);
            const result = fight(p, monster);
            if (result.win) {
                const coins = rand(1500, 3500) + floor * 500;
                cu.coins += coins;
                p.kills++;
                track(p, 'kills');
                const drop = pick(['gel', 'hueso', 'hueso', 'colmillo']);
                addItem(p, drop);
                const ups = addXp(p, 18 + floor * 6);
                return reply(`⚔️ Te salió al paso *${monster.name}* y lo venciste en ${result.rounds} turnos.\n\n✿ *Botín* » ${money(coins)} y ${label(drop, 1)}\n✿ *Daño recibido* » ${result.taken}` + life() + levelUpText(p, ups));
            }
            p.deaths++;
            const lost = Math.min(cu.coins, rand(1000, 4000));
            cu.coins -= lost;
            return reply(`💀 *${monster.name}* te derrotó y perdiste ${money(lost)} al huir.\n\n> Estás fuera de combate: usa *descansar*, *curar* o una poción.`);
        }

        // Trampa.
        if (roll < 0.93) {
            const hurt = Math.min(p.hp - 1, rand(8, 22));
            p.hp -= Math.max(0, hurt);
            return reply(`🕳️ ${pick(['Caíste en una trampa de pinchos', 'Pisaste un nido de avispas gigantes', 'Una roca te cayó encima'])} y perdiste *${Math.max(0, hurt)}* de vida.` + life());
        }

        // Fuente curativa.
        p.hp = maxHp(p);
        const ups = addXp(p, 10);
        return reply(`⛲ Encontraste una fuente encantada y recuperaste toda tu vida.` + life() + levelUpText(p, ups));
    }
});
