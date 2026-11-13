import {
    rpgCommand, chatUser, savePlayer, challenges, challengeKey, CHALLENGE_TTL_MS, waitFor, startCooldown, timeLeft,
    attackOf, defenseOf, maxHp, addXp, chance, money, fmt
} from '../../lib/rpg.ts';
import type { Player } from '../../lib/rpg.ts';

const tag = (jid: string) => `@${jid.split('@')[0]}`;

/** Duelo amistoso: se pelea con la vida completa y nadie sale herido de verdad. */
function simulate(a: Player, b: Player): { aWins: boolean; rounds: number; aLeft: number; bLeft: number } {
    let ha = maxHp(a);
    let hb = maxHp(b);
    const hit = (atk: number, def: number) => Math.max(1, Math.round(atk * (0.8 + Math.random() * 0.4) * (chance(0.12) ? 1.7 : 1) - def * 0.5));
    let rounds = 0;
    // Empieza cualquiera de los dos.
    let aTurn = chance(0.5);
    while (ha > 0 && hb > 0 && rounds < 300) {
        rounds++;
        if (aTurn) hb -= hit(attackOf(a), defenseOf(b));
        else ha -= hit(attackOf(b), defenseOf(a));
        aTurn = !aTurn;
    }
    return { aWins: hb <= 0, rounds, aLeft: Math.max(0, ha), bLeft: Math.max(0, hb) };
}

export default rpgCommand({
    command: ['duelo', 'duel', 'pvp', 'retar', 'aceptar', 'rechazar'],
    description: 'Reta a alguien a un duelo (con apuesta si quieres); el retado responde con aceptar',
    usage: '@mención [apuesta]',
    run: ({ ctx, chat, jid, p, cu, args, px, reply, target }) => {
        const command = String(ctx.command || '').toLowerCase();
        const now = Date.now();

        if (command === 'aceptar' || command === 'rechazar') {
            const key = challengeKey(chat, jid);
            const challenge = challenges.get(key);
            if (!challenge || now - challenge.ts > CHALLENGE_TTL_MS) {
                challenges.delete(key);
                return reply('✿ No tienes ningún duelo pendiente.');
            }
            challenges.delete(key);
            if (command === 'rechazar') return reply(`🏳️ ${tag(jid)} rechazó el duelo de ${tag(challenge.from)}.`, [jid, challenge.from]);

            const rival = chatUser(chat, challenge.from);
            const bet = challenge.bet;
            if (bet > 0 && (cu.coins < bet || rival.coins < bet)) {
                return reply(`✿ Alguno de los dos ya no tiene las ${fmt(bet)} monedas de la apuesta. Duelo cancelado.`);
            }

            const result = simulate(rival.rpg, p);
            const winner = result.aWins ? challenge.from : jid;
            const loser = result.aWins ? jid : challenge.from;
            const w = result.aWins ? rival : cu;
            const l = result.aWins ? cu : rival;
            w.coins += bet;
            l.coins -= bet;
            w.rpg.wins++;
            addXp(w.rpg, 40);
            addXp(l.rpg, 15);
            savePlayer(chat, challenge.from);

            return reply(
                `🤺 *DUELO*\n\n${tag(challenge.from)} ⚔️ ${tag(jid)}\n\n` +
                `🏆 Ganó ${tag(winner)} en ${result.rounds} turnos, con *${result.aWins ? result.aLeft : result.bLeft}* de vida restante.\n` +
                (bet > 0 ? `✿ Se lleva ${money(bet)} de ${tag(loser)}.\n` : '') +
                `✿ *Experiencia* » +40 para quien ganó, +15 para quien perdió`,
                [challenge.from, jid]);
        }

        const rivalJid = target();
        if (!rivalJid) return reply(`✿ Menciona a quién quieres retar.\n> Ejemplo » *${px}duelo @persona 5000*`);
        if (rivalJid === jid) return reply('✿ No puedes retarte a ti mismo.');

        const left = waitFor(p, 'duelo');
        if (left > 0) return reply(`⏳ Podrás retar de nuevo en *${timeLeft(left)}*.`);

        const bet = Math.max(0, Math.floor(Number(args.find(a => /^\d+$/.test(a)) || 0)));
        if (bet > cu.coins) return reply(`✿ No tienes ${fmt(bet)} monedas para apostar (tienes ${fmt(cu.coins)}).`);
        if (bet > chatUser(chat, rivalJid).coins) return reply(`✿ ${tag(rivalJid)} no tiene ${fmt(bet)} monedas para cubrir la apuesta.`, [rivalJid]);

        startCooldown(p, 'duelo');
        challenges.set(challengeKey(chat, rivalJid), { from: jid, to: rivalJid, bet, ts: now });

        return reply(
            `🤺 ${tag(jid)} reta a ${tag(rivalJid)} a un duelo${bet ? ` apostando ${money(bet)}` : ' amistoso'}.\n\n` +
            `> ${tag(rivalJid)}: responde *${px}aceptar* o *${px}rechazar* (tienes 90 segundos).`,
            [jid, rivalJid]);
    }
});
