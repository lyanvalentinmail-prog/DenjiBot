import { rpgCommand, chatUser, upOf, maxHp, attackOf, defenseOf, xpNeeded, jobOf, label, bar, fmt, money, displayName } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['rpg', 'heroe', 'personaje', 'rperfil'],
    description: 'Muestra tu personaje del RPG: vida, nivel, equipo y oficio',
    usage: '[@mención]',
    run: ({ chat, jid, px, reply, target }) => {
        const who = target() || jid;
        const cu = chatUser(chat, who);
        const p = cu.rpg;
        const job = jobOf(p);
        const up = (n: number) => (n ? ` +${n}` : '');

        const lines = [
            `⚔️ *PERFIL RPG* » ${displayName(who)}`,
            '',
            `❤️ *Vida* » ${p.hp}/${maxHp(p)}  ${bar(p.hp, maxHp(p))}`,
            `⭐ *Nivel* » ${p.lvl}  (${fmt(p.xp)}/${fmt(xpNeeded(p.lvl))} XP)`,
            `🗡️ *Ataque* » ${attackOf(p)}   🛡️ *Defensa* » ${defenseOf(p)}`,
            '',
            `✿ *Arma* » ${p.weapon ? label(p.weapon) + up(upOf(p, p.weapon)) : 'ninguna'}`,
            `✿ *Armadura* » ${p.armor ? label(p.armor) + up(upOf(p, p.armor)) : 'ninguna'}`,
            `✿ *Oficio* » ${job ? `${job.emoji} ${job.name}` : 'sin oficio'}`,
            `✿ *Monedas* » ${money(cu.coins)}`,
            '',
            `🏰 *Piso más profundo* » ${p.best}`,
            `☠️ *Monstruos derrotados* » ${fmt(p.kills)}`,
            `🤺 *Duelos ganados* » ${fmt(p.wins)}`
        ];
        if (p.run) lines.push('', `> Tienes una mazmorra en curso (piso ${p.run.floor}). Sigue con *${px}mazmorra*.`);
        else lines.push('', `> Mira todos los comandos con *${px}menu rpg*`);

        return reply(lines.join('\n'), who === jid ? undefined : [who]);
    }
});
