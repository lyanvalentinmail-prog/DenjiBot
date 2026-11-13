import { rpgCommand, JOBS, jobOf, waitFor, startCooldown, timeLeft } from '../../lib/rpg.ts';

const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default rpgCommand({
    command: ['oficio', 'oficios', 'profesion'],
    description: 'Elige tu oficio: cada uno da una ventaja distinta',
    usage: '[nombre]',
    run: ({ p, args, px, reply }) => {
        const current = jobOf(p);
        const wanted = plain(args.join(' '));

        if (!wanted) {
            const lines = ['🧑‍🌾 *OFICIOS*', ''];
            for (const job of JOBS) {
                lines.push(`${job.emoji} *${job.name}*${current?.id === job.id ? ' _(el tuyo)_' : ''}`, `> ${job.perk}`);
            }
            lines.push('', `✿ Elige uno con *${px}oficio <nombre>* y gana monedas con *${px}trabajar*.`);
            return reply(lines.join('\n'));
        }

        const job = JOBS.find(j => plain(j.name) === wanted || j.id === wanted) || JOBS.find(j => plain(j.name).startsWith(wanted));
        if (!job) return reply(`✿ No conozco ese oficio. Mira la lista con *${px}oficio*.`);
        if (current?.id === job.id) return reply(`✿ Ya eres ${job.emoji} *${job.name}*.`);

        // El primer oficio es inmediato; para cambiarlo hay que esperar.
        if (current) {
            const left = waitFor(p, 'oficio');
            if (left > 0) return reply(`⏳ Podrás cambiar de oficio en *${timeLeft(left)}*.`);
        }

        p.job = job.id;
        startCooldown(p, 'oficio');
        return reply(`${job.emoji} Ahora eres *${job.name}*.\n\n✿ *Ventaja* » ${job.perk}\n> Usa *${px}trabajar* para cobrar tu primer sueldo.`);
    }
});
