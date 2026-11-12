import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import chalk from 'chalk';
import qrcode from 'qrcode';
import { ROOT, loadSettings } from '../settings.ts';
import { sessionDir, readSession } from '../sessions.ts';
import { EXIT_NEED_LINK } from '../bridge.ts';
import type { Runtime, BridgeMessage } from '../bridge.ts';

/**
 * Supervisor del bot para el panel: lo ejecuta como proceso hijo, guarda sus
 * logs en memoria y recibe su estado (conexión, QR, código, contadores).
 */

export interface StartOptions {
    method?: 'qr' | 'code';
    phone?: string;
}

const MAX_LOGS = 1000;
const accent = chalk.hex('#FF7A1A');

export const bot = {
    child: null as ChildProcess | null,
    runtime: null as Runtime | null,
    logs: [] as string[],
    /** Total de líneas recibidas (sirve para mantener la posición al desplazar). */
    logSeq: 0,
    qrText: '',
    pairingCode: '',
    /** Aviso para mostrar en el menú principal. */
    notice: '',
    session: '',
    startedAt: 0,
    /** 'update' (algo cambió), 'qr' (nuevo QR), 'need_link' (falta vincular). */
    events: new EventEmitter()
};

let stopping = false;
let needLinkReason = '';
let lastOptions: StartOptions = {};
let restartTimer: NodeJS.Timeout | null = null;
let crashes: number[] = [];

export const isRunning = (): boolean => bot.child !== null;

function addLog(line: string): void {
    // Solo se conservan los códigos de color; cualquier otro control de terminal rompería la pantalla.
    const clean = line
        .replace(/\r/g, '')
        .replace(/\t/g, '    ')
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-ln-~]/g, '')
        .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
        .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, '');
    bot.logs.push(clean);
    bot.logSeq++;
    if (bot.logs.length > MAX_LOGS) bot.logs.splice(0, bot.logs.length - MAX_LOGS);
}

export function panelLog(text: string): void {
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
    addLog(`${accent('[ PANEL ]')} ${chalk.gray(time)} ${text}`);
    bot.events.emit('update');
}

function attach(stream: NodeJS.ReadableStream | null): void {
    if (!stream) return;
    let partial = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
        const parts = (partial + chunk).split('\n');
        partial = parts.pop() ?? '';
        for (const part of parts) addLog(part);
        bot.events.emit('update');
    });
    stream.on('end', () => {
        if (partial) addLog(partial);
        partial = '';
    });
}

function onMessage(message: BridgeMessage): void {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'runtime') {
        bot.runtime = message.runtime;
        if (message.runtime.status === 'connected') {
            bot.qrText = '';
            bot.pairingCode = '';
            crashes = [];
        }
        bot.events.emit('update');
    } else if (message.type === 'qr') {
        qrcode
            // Nivel de corrección 'L': el QR más pequeño posible, para que quepa en pantallas estrechas.
            .toString(message.qr, { type: 'terminal', small: true, errorCorrectionLevel: 'L' })
            .then(text => {
                bot.qrText = text.replace(/\n+$/, '');
                bot.events.emit('qr');
                bot.events.emit('update');
            })
            .catch(() => {});
    } else if (message.type === 'pairing') {
        bot.pairingCode = message.code;
        bot.events.emit('update');
    } else if (message.type === 'need_link') {
        needLinkReason = message.reason;
    }
}

function scheduleRestart(): void {
    const now = Date.now();
    crashes = crashes.filter(t => now - t < 120_000);
    crashes.push(now);

    if (crashes.length > 5) {
        crashes = [];
        bot.notice = 'El bot se cerró varias veces seguidas. Revisa la consola antes de iniciarlo de nuevo.';
        panelLog(chalk.red('Demasiados reinicios seguidos; se detiene el reinicio automático.'));
        return;
    }

    panelLog('Reiniciando el bot en 3 segundos…');
    restartTimer = setTimeout(() => {
        restartTimer = null;
        if (!bot.child) startBot(lastOptions);
    }, 3000);
}

export function startBot(options: StartOptions = {}): void {
    if (bot.child) return;
    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    const settings = loadSettings();
    const linked = readSession(settings.activeSession).registered;

    bot.session = settings.activeSession;
    bot.runtime = null;
    bot.qrText = '';
    bot.pairingCode = '';
    bot.notice = '';
    bot.startedAt = Date.now();
    needLinkReason = '';
    stopping = false;
    // Una sesión ya vinculada no necesita método ni número.
    lastOptions = linked ? {} : options;

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        DENJI_SESSION_DIR: sessionDir(bot.session),
        FORCE_COLOR: String(chalk.level)
    };
    delete env.DENJI_METHOD;
    delete env.DENJI_PHONE;
    if (lastOptions.method) env.DENJI_METHOD = lastOptions.method;
    if (lastOptions.phone) env.DENJI_PHONE = lastOptions.phone;

    const execArgv = Array.from(new Set(['--disable-warning=ExperimentalWarning', ...process.execArgv]));

    panelLog(`Iniciando ${settings.botName} (sesión "${bot.session}")…`);

    let child: ChildProcess;
    try {
        child = spawn(process.execPath, [...execArgv, 'index.ts'], {
            cwd: ROOT,
            env,
            stdio: ['ignore', 'pipe', 'pipe', 'ipc']
        });
    } catch (error: any) {
        panelLog(chalk.red(`No se pudo iniciar el bot: ${error?.message || error}`));
        return;
    }

    bot.child = child;
    attach(child.stdout);
    attach(child.stderr);
    child.on('message', onMessage as any);

    child.on('error', error => {
        panelLog(chalk.red(`Error del proceso del bot: ${error.message}`));
    });

    child.on('exit', (code, signal) => {
        if (bot.child !== child) return;
        const wasStopping = stopping;
        bot.child = null;
        bot.runtime = null;
        bot.qrText = '';
        bot.pairingCode = '';
        stopping = false;

        if (code === EXIT_NEED_LINK) {
            bot.notice = needLinkReason || 'La sesión no está vinculada. Usa "Start" para vincularla.';
            panelLog(chalk.yellow(bot.notice));
            bot.events.emit('need_link');
        } else if (wasStopping) {
            panelLog('Bot detenido.');
        } else {
            panelLog(chalk.red(`El bot se cerró (${signal ? 'señal ' + signal : 'código ' + code}).`));
            if (loadSettings().autoRestart) scheduleRestart();
        }
        bot.events.emit('update');
    });
}

export function stopBot(): Promise<void> {
    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }
    const child = bot.child;
    if (!child) return Promise.resolve();

    stopping = true;
    return new Promise<void>(resolve => {
        const force = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch {}
        }, 4000);
        child.once('exit', () => {
            clearTimeout(force);
            resolve();
        });
        try {
            child.kill('SIGTERM');
        } catch {
            clearTimeout(force);
            resolve();
        }
    });
}

export async function restartBot(): Promise<void> {
    const options = lastOptions;
    await stopBot();
    startBot(options);
}

/** Cierre inmediato (al salir del panel). */
export function killBotNow(): void {
    if (restartTimer) clearTimeout(restartTimer);
    try {
        bot.child?.kill('SIGKILL');
    } catch {}
}
