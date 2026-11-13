import { rpgCommand, startCooldown, addXp, levelUpText, track, rand, pick, chance, addItem, label, money } from '../../lib/rpg.ts';

const wins = [
    'Vaciaste la caja fuerte de un mercader distraído',
    'Vendiste mapas del tesoro falsos en la taberna',
    'Asaltaste una caravana de impuestos',
    'Hiciste trampa en los dados y nadie lo notó',
    'Robaste las joyas de un noble mientras dormía'
];
const fails = [
    'La guardia te atrapó saltando un muro',
    'Tu cómplice te delató por unas monedas',
    'Intentaste robar a un mago y te convirtió en rana un rato',
    'Resbalaste huyendo y caíste frente al capitán',
    'El cofre que abriste era una trampa'
];

export default rpgCommand({
    command: ['crimen', 'delito', 'delinquir'],
    description: 'Comete un crimen: puedes ganar mucho o pagar una multa',
    cooldown: 'crimen',
    alive: true,
    run: ({ p, cu, reply }) => {
        startCooldown(p, 'crimen');
        track(p, 'crime');

        // Con más nivel hay más probabilidad de salir bien (hasta un 75%).
        if (chance(Math.min(0.75, 0.5 + p.lvl * 0.01))) {
            const gain = Math.round(rand(5000, 16000) * (1 + (p.lvl - 1) * 0.05));
            cu.coins += gain;
            const ups = addXp(p, rand(18, 32));
            let text = `🦹 ${pick(wins)} y te llevaste ${money(gain)}.`;
            if (chance(0.15)) {
                const id = pick(['oro', 'diamante', 'pocion', 'cofre']);
                addItem(p, id);
                text += `\n✿ *Además encontraste* » ${label(id, 1)}`;
            }
            return reply(text + levelUpText(p, ups));
        }

        const fine = Math.min(cu.coins, rand(2500, 8000));
        const hurt = Math.min(p.hp - 1, rand(8, 20));
        cu.coins -= fine;
        p.hp -= Math.max(0, hurt);
        return reply(`🚔 ${pick(fails)}.\n\n✿ *Multa* » ${money(fine)}\n✿ *Vida* » -${Math.max(0, hurt)} ❤️`);
    }
});
