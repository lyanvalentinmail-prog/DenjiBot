import type { EventEmitter } from 'node:events';

/**
 * Puente entre el bot y el panel de `npm start`.
 *
 * Cuando el bot corre como proceso hijo del panel, le envía por IPC su estado
 * (conexión, QR, código de vinculación y contadores) para la consola y el
 * dashboard. Si el bot se ejecuta directamente no hace nada.
 */

export interface Runtime {
    status: 'starting' | 'connecting' | 'qr' | 'pairing' | 'connected' | 'disconnected';
    number: string;
    name: string;
    plugins: number;
    messages: number;
    commands: number;
    errors: number;
    topCommands: [string, number][];
    startedAt: number;
    connectedAt: number;
    rss: number;
    heapUsed: number;
}

export type BridgeMessage =
    | { type: 'runtime'; runtime: Runtime }
    | { type: 'qr'; qr: string }
    | { type: 'pairing'; code: string }
    | { type: 'need_link'; reason: string };

/** Código de salida que indica al panel que hace falta vincular la sesión. */
export const EXIT_NEED_LINK = 10;

export const underPanel = (): boolean => typeof process.send === 'function';

export function sendToPanel(message: BridgeMessage): void {
    if (!underPanel()) return;
    try {
        process.send!(message);
    } catch {}
}

export function initBridge(eventBus: EventEmitter): void {
    if (!underPanel()) return;

    const commandCount = new Map<string, number>();
    const runtime: Runtime = {
        status: 'starting',
        number: '',
        name: '',
        plugins: 0,
        messages: 0,
        commands: 0,
        errors: 0,
        topCommands: [],
        startedAt: Date.now(),
        connectedAt: 0,
        rss: 0,
        heapUsed: 0
    };

    const push = () => {
        const mem = process.memoryUsage();
        runtime.rss = mem.rss;
        runtime.heapUsed = mem.heapUsed;
        runtime.topCommands = Array.from(commandCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        sendToPanel({ type: 'runtime', runtime });
    };

    eventBus.on('bot_status', ({ payload }: any) => {
        const status = payload?.status;
        if (status === 'connected') {
            runtime.status = 'connected';
            runtime.connectedAt = Date.now();
            runtime.number = String(payload?.number || runtime.number);
            runtime.name = String(payload?.name || runtime.name);
        } else if (status === 'disconnected') {
            runtime.status = 'disconnected';
            runtime.connectedAt = 0;
        } else if (status === 'connecting') {
            runtime.status = 'connecting';
        }
        push();
    });

    eventBus.on('qr_generated', ({ payload }: any) => {
        runtime.status = 'qr';
        if (payload?.qr) sendToPanel({ type: 'qr', qr: String(payload.qr) });
        push();
    });

    eventBus.on('pairing_code', ({ payload }: any) => {
        runtime.status = 'pairing';
        if (payload?.code) sendToPanel({ type: 'pairing', code: String(payload.code) });
        push();
    });

    eventBus.on('plugins_loaded', ({ payload }: any) => {
        runtime.plugins = Number(payload?.count) || 0;
    });

    eventBus.on('message_received', () => {
        runtime.messages++;
    });

    eventBus.on('command_executed', ({ payload }: any) => {
        runtime.commands++;
        const name = String(payload?.command || '').toLowerCase();
        if (name) commandCount.set(name, (commandCount.get(name) || 0) + 1);
    });

    eventBus.on('handler_error', () => {
        runtime.errors++;
    });

    setInterval(push, 2000).unref();

    // Si el panel se cierra, el bot no debe quedar huérfano en segundo plano.
    process.on('disconnect', () => process.exit(0));
}
