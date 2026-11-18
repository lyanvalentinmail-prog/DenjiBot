import { performance } from 'node:perf_hooks';

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

const traces = new WeakMap<object, { received: number; command?: number; reported?: boolean }>();
const enabled = process.env.BOT_LATENCY === '1';

export const statsDay = (now = Date.now()): string =>
    dateFormatter.format(now).split('/').reverse().join('-');

export function beginMessage(msg: any, clock?: () => number): void {
    if (!enabled && !clock) return;
    if (!msg || typeof msg !== 'object') return;
    traces.set(msg, { received: (clock || performance.now.bind(performance))() });
}

export function markCommand(msg: any, clock?: () => number): void {
    if (!msg || typeof msg !== 'object') return;
    const trace = traces.get(msg);
    if (trace) trace.command = (clock || performance.now.bind(performance))();
}

export function instrumentSocket(
    sock: any,
    {
        enabled: active = enabled,
        clock = () => performance.now(),
        report = (info: any) => console.log('[latency]', JSON.stringify(info))
    }: { enabled?: boolean; clock?: () => number; report?: (info: any) => void } = {}
): void {
    if (!active || !sock?.sendMessage) return;
    const send = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid: string, content: any, options?: any) => {
        const quoted = options?.quoted;
        const trace = quoted && typeof quoted === 'object' ? traces.get(quoted) : undefined;
        if (!trace || trace.reported) return send(jid, content, options);
        trace.reported = true;
        const started = clock();
        let ok = false;
        try {
            const result = await send(jid, content, options);
            ok = true;
            return result;
        } finally {
            const finished = clock();
            try {
                report({
                    internalMs: started - trace.received,
                    commandReadyMs: trace.command == null ? null : trace.command - trace.received,
                    sendMs: finished - started,
                    totalMs: finished - trace.received,
                    ok
                });
            } catch {}
        }
    };
}
