import { rpgCommand, normalizePlayer, attackOf, displayName, fmt } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['rtop', 'toprpg', 'rpgtop', 'aventureros'],
    description: 'Los mejores aventureros de este chat',
    run: ({ chat, jid, reply }) => {
        const users = (global as any).db?.data?.chats?.[chat]?.users || {};
        const rows = Object.entries(users)
            .filter(([, cu]: any) => cu?.rpg && Object.keys(cu.rpg).length)
            .map(([who, cu]: any) => ({ who, p: normalizePlayer(cu.rpg) }))
            .filter(row => row.p.lvl > 1 || row.p.xp > 0 || row.p.kills > 0)
            .sort((a, b) => b.p.lvl - a.p.lvl || b.p.xp - a.p.xp || b.p.best - a.p.best);

        if (!rows.length) return reply('🏆 Todavía nadie ha empezado su aventura en este chat.');

        const medals = ['🥇', '🥈', '🥉'];
        const lines = rows.slice(0, 10).map((row, i) =>
            `${medals[i] || `${i + 1}.`} *${displayName(row.who)}* — nivel ${row.p.lvl}\n> 🗡️ ${attackOf(row.p)} · 🏰 piso ${row.p.best} · ☠️ ${fmt(row.p.kills)}`);
        const mine = rows.findIndex(row => row.who === jid);

        return reply(`🏆 *MEJORES AVENTUREROS*\n\n${lines.join('\n')}` + (mine >= 10 ? `\n\n✿ Tu puesto » ${mine + 1} de ${rows.length}` : ''));
    }
});
