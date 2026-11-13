import { rpgCommand, dailyQuests, addItem, addXp, levelUpText, bar, fmt, money } from '../../lib/rpg.ts';

const claimWords = new Set(['reclamar', 'cobrar', 'claim', 'recoger']);

export default rpgCommand({
    command: ['misiones', 'mision', 'quests', 'diarias'],
    description: 'Tus tres misiones del día y sus recompensas',
    usage: '[reclamar]',
    run: ({ jid, p, cu, args, px, reply }) => {
        const quests = dailyQuests(p, jid);
        const progress = (id: string) => Math.floor(p.q.c[id] || 0);

        if (claimWords.has((args[0] || '').toLowerCase())) {
            let coins = 0;
            let xp = 0;
            const claimed: string[] = [];
            for (const quest of quests) {
                if (p.q.done.includes(quest.id) || progress(quest.id) < quest.goal) continue;
                p.q.done.push(quest.id);
                coins += quest.coins;
                xp += quest.xp;
                claimed.push(`✅ ${quest.text.replace('{n}', fmt(quest.goal))}`);
            }

            // Completar las tres da un cofre extra.
            let extra = '';
            if (!p.q.bonus && quests.every(quest => p.q.done.includes(quest.id))) {
                p.q.bonus = true;
                addItem(p, 'cofre');
                extra = `\n🎁 *Premio por completar las tres* » un cofre (*${px}cofre*)`;
            }
            if (!claimed.length && !extra) return reply(`✿ Aún no tienes misiones terminadas por cobrar.\n> Mira tu avance con *${px}misiones*.`);

            cu.coins += coins;
            const ups = addXp(p, xp);
            return reply(`📜 *Misiones cobradas*\n\n${claimed.join('\n')}\n\n✿ *Recompensa* » ${money(coins)} y +${xp} XP${extra}` + levelUpText(p, ups));
        }

        const lines = ['📜 *MISIONES DE HOY*', ''];
        let ready = 0;
        for (const quest of quests) {
            const done = p.q.done.includes(quest.id);
            const value = Math.min(progress(quest.id), quest.goal);
            const complete = value >= quest.goal;
            if (complete && !done) ready++;
            lines.push(
                `${done ? '✅' : complete ? '🎁' : '▫️'} *${quest.text.replace('{n}', fmt(quest.goal))}*`,
                `> ${bar(value, quest.goal, 8)} ${fmt(value)}/${fmt(quest.goal)} — ${fmt(quest.coins)} monedas, +${quest.xp} XP${done ? ' (cobrada)' : ''}`);
        }
        lines.push('', ready ? `✿ Tienes ${ready} por cobrar: *${px}misiones reclamar*` : p.q.bonus ? '✿ ¡Completaste todas las de hoy!' : '✿ Completa las tres para ganar un cofre extra.', '> Cambian cada día.');
        return reply(lines.join('\n'));
    }
});
