import config from '#config';
import type { ReactionEvent } from './settings.ts';

/*
 * Reacciones del bot a los mensajes con comandos.
 *
 * Qué emoji va en cada momento se configura en el panel de `npm start`
 * (Personalizar bot › Reacciones) y se guarda en `settings.json`:
 *   - espera / cargando  → mientras se prepara la respuesta
 *   - listo              → cuando el comando termina
 *   - error, sin permiso, comando desconocido → opcionales
 *   - un emoji propio por comando, que sustituye al de "listo"
 */

/** Emoji configurado para un momento ('' si no hay o las reacciones están apagadas). */
export function reactionFor(event: ReactionEvent, aliases: string[] = []): string {
    const reactions = config.reactions;
    if (!reactions?.enabled) return '';

    if (event === 'done') {
        for (const alias of aliases) {
            const own = reactions.commands[String(alias).toLowerCase()];
            if (own) return own;
        }
    }
    return reactions.events[event] || '';
}

export interface Reactor {
    /** Pone la reacción de un momento. Si ese momento no tiene emoji, quita la que hubiera. */
    event(event: ReactionEvent, aliases?: string[]): Promise<void>;
    /** Pone un emoji concreto ('' quita la reacción). */
    set(emoji: string): Promise<void>;
}

/**
 * Reacciones sobre un mensaje. Se envían en orden y nunca hacen fallar al
 * comando: si WhatsApp rechaza una reacción, simplemente se omite.
 */
export function createReactor(sock: any, msg: any): Reactor {
    let chain: Promise<void> = Promise.resolve();
    let shown = '';

    const set = (emoji: string): Promise<void> => {
        chain = chain.then(async () => {
            if (emoji === shown || !msg?.key || !msg?.chat) return;
            try {
                await sock.sendMessage(msg.chat, { react: { text: emoji, key: msg.key } });
                shown = emoji;
            } catch {}
        });
        return chain;
    };

    return {
        set,
        event: (event, aliases) => set(reactionFor(event, aliases))
    };
}
