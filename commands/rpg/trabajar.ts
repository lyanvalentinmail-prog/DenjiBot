import { rpgCommand, jobOf, startCooldown, addXp, levelUpText, track, rand, pick, chance, addItem, label, money } from '../../lib/rpg.ts';

const odd = ['Cargaste sacos en el puerto', 'Limpiaste los establos de la posada', 'Repartiste cartas por la aldea', 'Ayudaste a levantar un granero'];
const bonus = ['pan', 'manzana', 'madera', 'carbon', 'pocion'];

export default rpgCommand({
    command: ['trabajar', 'chambear', 'trabajo', 'job'],
    description: 'Trabaja en tu oficio para ganar monedas y experiencia',
    cooldown: 'trabajar',
    run: ({ p, cu, px, reply }) => {
        const job = jobOf(p);
        // Con oficio se cobra más, y el sueldo crece con el nivel.
        const pay = Math.round((job ? rand(4500, 9500) : rand(2500, 6000)) * (1 + (p.lvl - 1) * 0.06));
        const xp = rand(15, 28);

        cu.coins += pay;
        startCooldown(p, 'trabajar');
        track(p, 'work');
        const ups = addXp(p, xp);

        let text = `${job ? job.emoji : '🧹'} ${pick(job ? job.phrases : odd)} y ganaste ${money(pay)}.\n\n✿ *Experiencia* » +${xp}`;
        if (chance(0.2)) {
            const id = pick(bonus);
            addItem(p, id);
            text += `\n✿ *Propina* » ${label(id, 1)}`;
        }
        if (!job) text += `\n\n> Sin oficio cobras menos. Elige uno con *${px}oficio*.`;
        return reply(text + levelUpText(p, ups));
    }
});
