import {
    rpgCommand, chatUser, savePlayer, waitFor, startCooldown, timeLeft, getBoss, saveBoss, newBoss, attackOf, defenseOf,
    maxHp, addItem, addXp, levelUpText, track, rand, displayName, fmt, money, bar
} from '../../lib/rpg.ts';

const attackWords = new Set(['atacar', 'attack', 'golpear', 'pelear', 'a']);

export default rpgCommand({
    command: ['jefe', 'boss', 'raid'],
    description: 'El jefe del chat: atáquenlo entre todos y repartan la recompensa',
    usage: '[atacar]',
    run: ({ chat, jid, p, cu, args, px, reply }) => {
        const boss = getBoss(chat);
        const ranking = () => Object.entries(boss.dmg).sort((a, b) => b[1] - a[1]);

        if (!attackWords.has((args[0] || '').toLowerCase())) {
            const top = ranking().slice(0, 5).map(([who, dmg], i) => `${i + 1}. ${displayName(who)} — ${fmt(dmg)}`).join('\n');
            const left = waitFor(p, 'jefe');
            return reply(
                `👹 *JEFE DEL CHAT* (nº ${boss.n + 1})\n\n*${boss.name}*\n` +
                `❤️ ${fmt(boss.hp)}/${fmt(boss.max)}  ${bar(boss.hp, boss.max, 12)}\n🗡️ Ataque ${boss.atk} · 🛡️ Defensa ${boss.def}\n\n` +
                (top ? `*Daño hecho*\n${top}\n\n` : '') +
                `✿ Al caer, cada quien cobra según su daño y recibe un cofre.\n` +
                `> *${px}jefe atacar* ${left > 0 ? `(disponible en ${timeLeft(left)})` : '» ¡golpéalo!'}`);
        }

        if (p.hp <= 0) return reply(`💀 Estás fuera de combate.\n> Recupérate con *${px}descansar*, *${px}curar* o *${px}usar pocion*.`);
        const left = waitFor(p, 'jefe');
        if (left > 0) return reply(`⏳ Recupera el aliento: podrás atacar de nuevo en *${timeLeft(left)}*.`);
        startCooldown(p, 'jefe');

        // Una ráfaga de tres golpes, y el jefe responde con uno.
        let dealt = 0;
        for (let i = 0; i < 3; i++) dealt += Math.max(1, Math.round(attackOf(p) * (0.85 + Math.random() * 0.3) - boss.def * 0.5));
        dealt = Math.min(dealt, boss.hp);
        const taken = Math.max(1, Math.round(boss.atk * (0.8 + Math.random() * 0.4) - defenseOf(p) * 0.5));

        boss.hp -= dealt;
        boss.dmg[jid] = (boss.dmg[jid] || 0) + dealt;
        p.hp = Math.max(0, p.hp - taken);
        const ups = addXp(p, 12 + Math.round(dealt / 10));

        if (boss.hp > 0) {
            saveBoss(chat, boss);
            return reply(
                `⚔️ Golpeaste a *${boss.name}* por *${fmt(dealt)}* y te devolvió *${taken}*.\n\n` +
                `👹 ${fmt(boss.hp)}/${fmt(boss.max)}  ${bar(boss.hp, boss.max, 12)}\n` +
                `❤️ *Tu vida* » ${p.hp}/${maxHp(p)}` + (p.hp <= 0 ? '\n\n💀 Quedaste fuera de combate.' : '') + levelUpText(p, ups));
        }

        // Cayó: el premio se reparte según el daño de cada quien.
        const pool = boss.max * 25;
        const list = ranking();
        const lines: string[] = [];
        const mentions: string[] = [];
        list.forEach(([who, dmg], i) => {
            const prize = Math.round(pool * (dmg / boss.max));
            const other = who === jid ? cu : chatUser(chat, who);
            other.coins += prize;
            addItem(other.rpg, i === 0 ? 'cofre_raro' : 'cofre');
            other.rpg.kills++;
            track(other.rpg, 'kills');
            if (who !== jid) savePlayer(chat, who);
            mentions.push(who);
            lines.push(`${i === 0 ? '🥇' : '✿'} @${who.split('@')[0]} — ${fmt(dmg)} de daño » ${fmt(prize)} + ${i === 0 ? '🧰 cofre raro' : '🎁 cofre'}`);
        });

        const next = newBoss(boss.n + 1);
        saveBoss(chat, next);
        return reply(
            `🎉 *¡${boss.name} ha caído!*\n\nEl golpe final fue de ${displayName(jid)}.\n\n${lines.slice(0, 15).join('\n')}\n\n` +
            `✿ *Premio repartido* » ${money(pool)}\n> Abre tu cofre con *${px}cofre*.\n\n👹 Aparece un nuevo jefe: *${next.name}* (❤️ ${fmt(next.max)}).` + levelUpText(p, ups),
            mentions);
    }
});
