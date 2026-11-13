import { rpgCommand, startCooldown, maxHp, bar } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['descansar', 'dormir', 'rest', 'acampar'],
    description: 'Descansa en la posada y recupera la mitad de tu vida, gratis',
    cooldown: 'descansar',
    run: ({ p, reply }) => {
        const top = maxHp(p);
        if (p.hp >= top) return reply(`❤️ Ya tienes la vida completa (${p.hp}/${top}).`);

        const before = p.hp;
        p.hp = Math.min(top, p.hp + Math.ceil(top / 2));
        startCooldown(p, 'descansar');
        return reply(`🏕️ Dormiste junto a la fogata y recuperaste *${p.hp - before}* de vida.\n\n❤️ *Vida* » ${p.hp}/${top}  ${bar(p.hp, top)}`);
    }
});
