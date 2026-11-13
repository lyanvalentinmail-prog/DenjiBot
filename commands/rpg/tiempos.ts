import { rpgCommand, COOLDOWNS, waitFor, timeLeft } from '../../lib/rpg.ts';

export default rpgCommand({
    command: ['tiempos', 'esperas', 'cd', 'rcd'],
    description: 'Cuánto falta para volver a usar cada acción del RPG',
    run: ({ p, reply }) => {
        const lines = Object.entries(COOLDOWNS)
            .filter(([key]) => key !== 'oficio' || p.job)
            .map(([key, info]) => {
                const left = waitFor(p, key);
                return `${left > 0 ? '⏳' : '✅'} *${info.name}* » ${left > 0 ? timeLeft(left) : 'disponible'}`;
            });
        return reply(`⏱️ *TIEMPOS DE ESPERA*\n\n${lines.join('\n')}`);
    }
});
