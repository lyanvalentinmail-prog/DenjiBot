/**
 * Panel de control de Denji bot (lo que abre `npm start`).
 *
 * Atajos del menú:
 *   1 Start · 2 Consola del bot · 3 Sesiones · 4 Eliminar sesiones
 *   5 Actualizar bot (git pull) · 6 Personalizar bot · 7 Eliminar datos · 0 Salir
 *
 * También permite borrar los datos por línea de comandos:
 *   npm run reset                (pide confirmación)
 *   npm run reset -- --yes       (borra todo sin preguntar)
 *   npm run reset -- --db        (solo base de datos y caché)
 *   npm run reset -- --keep-session (conserva sesión y dueños)
 *
 * Si no hay una terminal interactiva (pm2, paneles de hosting, etc.) se
 * ejecuta el bot directamente, igual que `npm run bot`.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';

const cliArgs = new Set(process.argv.slice(2).map(a => a.toLowerCase()));
const cliWipe = cliArgs.has('--wipe-all') || cliArgs.has('--reset-all') || cliArgs.has('--borrar-todo');

if (cliWipe) {
    await runCliWipe(cliArgs);
    process.exit(0);
}

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.DENJI_NO_PANEL;

if (!fs.existsSync(new URL('./node_modules/chalk', import.meta.url))) {
    console.error('\n Faltan las dependencias de Denji bot.\n Ejecuta primero:  npm install\n');
    process.exit(1);
}

if (!interactive) {
    await import('./index.ts');
} else {
    await runPanel();
}

async function runCliWipe(flags: Set<string>): Promise<void> {
    const { inspectBotData, wipeBotData, WIPE_PRESETS, formatDataBytes } = await import('./lib/wipe.ts');
    const summary = inspectBotData();

    const mode = flags.has('--db') || flags.has('--database')
        ? 'database'
        : flags.has('--keep-session') || flags.has('--sin-sesion')
            ? 'keepSession'
            : flags.has('--subs') || flags.has('--subbots')
                ? 'subs'
                : flags.has('--settings') || flags.has('--ajustes')
                    ? 'settings'
                    : flags.has('--tmp') || flags.has('--cache')
                        ? 'temp'
                        : 'all';

    const labels = {
        all: 'TODOS los datos (base de datos, sesiones, sub-bots, settings.json y caché)',
        keepSession: 'base de datos, sub-bots, caché y ajustes (conservando sesión y dueños)',
        database: 'base de datos y archivos temporales',
        subs: 'todas las sesiones de sub-bots',
        settings: 'archivo de ajustes (settings.json)',
        temp: 'archivos temporales y registros'
    } as const;

    console.log('\n DENJI BOT › Eliminar datos\n');
    console.log(`  Base de datos : ${summary.database.exists ? `${formatDataBytes(summary.database.bytes)} (${summary.database.users} usuarios, ${summary.database.groups} grupos)` : 'vacía'}`);
    console.log(`  Sesiones      : ${summary.sessions.exists ? `${summary.sessions.count} (${formatDataBytes(summary.sessions.bytes)})` : 'ninguna'}`);
    console.log(`  Sub-Bots      : ${summary.subs.exists ? `${summary.subs.count} (${formatDataBytes(summary.subs.bytes)})` : 'ninguno'}`);
    console.log(`  Ajustes       : ${summary.settings.exists ? formatDataBytes(summary.settings.bytes) : 'por defecto'}`);
    console.log(`  Temporales    : ${summary.temp.exists ? `${summary.temp.files} archivos (${formatDataBytes(summary.temp.bytes)})` : 'limpio'}`);
    console.log(`  Total         : ${formatDataBytes(summary.totalBytes)}\n`);

    if (!summary.hasAnyData) {
        console.log(' No hay datos guardados para eliminar.\n');
        return;
    }

    const autoYes = flags.has('--yes') || flags.has('-y') || flags.has('--force');
    if (!autoYes) {
        if (!process.stdin.isTTY) {
            console.error(' Terminal no interactiva: añade --yes para confirmar (npm run reset -- --yes).\n');
            process.exit(1);
        }
        console.log(` Se eliminará: ${labels[mode]}.`);
        console.log(' Asegúrate de tener el bot detenido antes de continuar.\n');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = (await rl.question(' ¿Confirmar eliminación definitiva? (escribe SI para continuar): ')).trim().toLowerCase();
        rl.close();
        if (answer !== 'si' && answer !== 'sí' && answer !== 's' && answer !== 'yes' && answer !== 'y') {
            console.log('\n Operación cancelada.\n');
            return;
        }
    }

    const res = wipeBotData(WIPE_PRESETS[mode]);
    if (!res.ok) {
        console.error(`\n ✖ No se pudo eliminar todo: ${res.failed.join(', ')}\n`);
        process.exit(1);
    }
    const detail = res.removed.length ? res.removed.join(', ') : 'sin cambios';
    console.log(`\n ✔ Datos eliminados (${detail}) · ${formatDataBytes(res.freedBytes)} liberados.\n`);
}

async function runPanel(): Promise<void> {
    const {
        c, draw, scheduleDraw, initTerminal, restoreTerminal, show, select, prompt, confirm, message,
        fmtBytes, fmtNumber, fmtDuration, fmtAgo, bar, pad, rule, cols, rows, wrap
    } = await import('./lib/panel/tui.ts');
    const { bot, isRunning, startBot, stopBot, restartBot, killBotNow, clearBotLogs, panelLog } = await import('./lib/panel/bot.ts');
    const {
        ROOT, loadSettings, saveSettings, resetSettings, cleanNumber, isValidSessionName,
        DEFAULT_BANNER, LOG_MODES, MENU_STYLES, MENU_STYLE_NAMES, MENU_STYLE_HINTS,
        MENU_THEMES, MENU_THEME_NAMES, REACTION_EVENTS, REACTION_EVENT_NAMES,
        REACTION_EVENT_HINTS, MAX_COMMAND_REACTIONS,
        TIKTOK_S2_SOURCES, TIKTOK_S2_SOURCE_NAMES, TIKTOK_S2_SOURCE_HINTS,
        TIKTOK_S2_MODES, TIKTOK_S2_MODE_NAMES, TIKTOK_S2_MODE_HINTS,
        cleanEmoji, cleanCommandName, cleanTikTokUsername, cleanTargetJid
    } = await import('./lib/settings.ts');
    const { sampleMenu } = await import('./lib/menustyles.ts');

    type MenuStyle = (typeof MENU_STYLES)[number];
    type MenuTheme = (typeof MENU_THEMES)[number];
    type ReactionEvent = (typeof REACTION_EVENTS)[number];
    type TikTokS2Source = (typeof TIKTOK_S2_SOURCES)[number];
    type TikTokS2Mode = (typeof TIKTOK_S2_MODES)[number];
    const { listSessions, readSession, deleteSession, migrateLegacySession } = await import('./lib/sessions.ts');
    const { inspectBotData, wipeBotData, WIPE_PRESETS } = await import('./lib/wipe.ts');
    const { collectStats, listKnownChats } = await import('./lib/stats.ts');

    type Stats = Awaited<ReturnType<typeof collectStats>>;
    type StartOptions = NonNullable<Parameters<typeof startBot>[0]>;
    type SessionInfo = ReturnType<typeof readSession>;
    type Action = 'start' | 'console' | 'sessions' | 'delete' | 'update' | 'customize' | 'wipe' | 'stop' | 'quit' | 'none';

    const version: string = (() => {
        try {
            return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '';
        } catch {
            return '';
        }
    })();

    // ───────────────────────── estadísticas ─────────────────────────

    let stats: Stats | null = null;
    let statsAt = 0;
    let statsBusy = false;

    function refreshStats(maxAge = 5000): void {
        if (statsBusy || Date.now() - statsAt < maxAge) return;
        statsBusy = true;
        collectStats()
            .then(result => {
                stats = result;
                statsAt = Date.now();
                scheduleDraw();
            })
            .catch(() => {})
            .finally(() => {
                statsBusy = false;
            });
    }

    function resetStatsCache(): void {
        stats = null;
        statsAt = 0;
        refreshStats(0);
    }

    bot.events.on('wipe', () => resetStatsCache());

    // ───────────────────────── textos comunes ─────────────────────────

    const LOGO = [
        ' ╔╦╗╔═╗╔╗╔ ╦╦  ╔╗ ╔═╗╔╦╗',
        '  ║║║╣ ║║║ ║║  ╠╩╗║ ║ ║ ',
        ' ═╩╝╚═╝╝╚╝╚╝╩  ╚═╝╚═╝ ╩ '
    ];

    const title = (section: string): string[] => [
        ' ' + c.accentBold('DENJI BOT') + c.dim(' › ') + c.bold(section),
        ' ' + rule()
    ];

    const phone = (number: string): string => (number ? '+' + number : '');

    /** Párrafo ajustado al ancho de la pantalla. */
    const para = (text: string, color: (value: string) => string = c.white): string[] =>
        wrap(text, cols() - 2).map(line => ' ' + color(line));

    function statusText(): string {
        if (!isRunning()) return c.dim('○ Detenido');
        switch (bot.runtime?.status) {
            case 'connected':
                return c.green('● Conectado');
            case 'qr':
                return c.yellow('◐ Esperando QR');
            case 'pairing':
                return c.yellow('◐ Esperando código');
            case 'disconnected':
                return c.red('● Reconectando');
            default:
                return c.yellow('◐ Conectando…');
        }
    }

    function statusLine(): string {
        const parts = [statusText()];
        const rt = bot.runtime;
        if (rt?.status === 'connected') {
            if (rt.number) parts.push(c.white(phone(rt.number)));
            if (rt.connectedAt) parts.push(c.dim(fmtDuration(Date.now() - rt.connectedAt)));
        }
        return parts.join(c.dim(' · '));
    }

    const field = (label: string, value: string, size = 10): string => ' ' + c.dim(pad(label, size)) + ' ' + value;

    function describeSession(session: SessionInfo): string {
        if (session.registered) {
            return [phone(session.number) || 'vinculada', fmtBytes(session.size), fmtAgo(session.modified)].join(' · ');
        }
        return session.exists && session.files > 0 ? 'sin vincular' : 'vacía';
    }

    // ───────────────────────── menú principal ─────────────────────────

    function menuHeader(): string[] {
        const settings = loadSettings();
        const session = readSession(settings.activeSession);
        const lines = [
            '',
            ...LOGO.map(line => c.accentBold(line)),
            ' ' + c.dim(`Panel de control${version ? ' · v' + version : ''}`),
            '',
            field('Bot', c.bold(settings.botName)),
            field('Estado', statusLine()),
            field('Sesión', c.white(session.name) + c.dim(' · ') + (session.registered
                ? c.green('vinculada') + (session.number ? c.dim(' ' + phone(session.number)) : '')
                : c.yellow('sin vincular')))
        ];

        if (stats) {
            lines.push(field('Usuarios', c.white(fmtNumber(stats.users)) + c.dim(' registrados · ') +
                c.white(fmtNumber(stats.groups)) + c.dim(' grupos')));
            lines.push(field('Espacio', c.white(fmtBytes(stats.storage.userData)) + c.dim(' de usuarios · BD ') +
                c.white(fmtBytes(stats.storage.database))));
        }

        if (!settings.owners.length) {
            lines.push('', ...para('! Sin dueño configurado: Personalizar bot › Dueños', c.yellow));
        }
        if (bot.notice) lines.push('', ...para('! ' + bot.notice, c.yellow));
        return lines;
    }

    function mainMenu(): Promise<Action> {
        refreshStats(0);
        return select<Action>({
            header: menuHeader,
            options: () => {
                const running = isRunning();
                const options: { label: string; hint: string; value: Action; key: string }[] = [
                    { label: 'Start', hint: running ? 'Reiniciar o detener' : 'Iniciar (QR o código)', value: 'start', key: '1' },
                    { label: 'Consola del bot', hint: 'Logs y dashboard', value: 'console', key: '2' },
                    { label: 'Sesiones', hint: 'Ver, crear y elegir', value: 'sessions', key: '3' },
                    { label: 'Eliminar sesiones', hint: 'Borrar vinculaciones', value: 'delete', key: '4' },
                    { label: 'Actualizar bot', hint: 'git pull', value: 'update', key: '5' },
                    { label: 'Personalizar bot', hint: 'Menú, reacciones, nombre…', value: 'customize', key: '6' },
                    { label: 'Eliminar datos', hint: 'BD, sub-bots, ajustes o todo', value: 'wipe', key: '7' }
                ];
                if (running) options.push({ label: 'Detener bot', hint: 'Apagar el bot', value: 'stop', key: '8' });
                options.push({ label: 'Salir', hint: 'Cerrar el panel', value: 'quit', key: '0' });
                return options;
            },
            back: 'none',
            footer: '↑↓ mover · Enter elegir · 0-8 atajos',
            tick: 1000,
            onTick: () => refreshStats(10_000)
        });
    }

    // ───────────────────────── start ─────────────────────────

    /** Pregunta cómo vincular si la sesión activa aún no lo está. `null` = cancelado. */
    async function askLinkOptions(): Promise<StartOptions | null> {
        const session = readSession(loadSettings().activeSession);
        if (session.registered) return {};

        const method = await select<'qr' | 'code' | null>({
            header: () => [
                ...title('Start'),
                ...para(`La sesión "${session.name}" todavía no está vinculada.`),
                ' ' + c.bold('¿Cómo quieres vincular WhatsApp?')
            ],
            options: [
                { label: 'Código QR', hint: 'Escanear con otro móvil', value: 'qr', key: '1' },
                { label: 'Código de 8 dígitos', hint: 'Pairing code', value: 'code', key: '2' },
                { label: 'Volver', value: null, key: '0' }
            ],
            back: null
        });
        if (!method) return null;
        if (method === 'qr') return { method };

        const number = await prompt({
            header: () => title('Start › Código de vinculación'),
            label: 'Número de WhatsApp del bot',
            hint: 'Con código de país, sin + ni espacios. Ej: 59899123456',
            maxLength: 24,
            validate: value => {
                const digits = cleanNumber(value);
                return digits.length >= 8 && digits.length <= 15 ? null : 'Escribe un número válido (8 a 15 dígitos).';
            }
        });
        if (number === null) return null;
        return { method: 'code', phone: cleanNumber(number) };
    }

    async function startFlow(): Promise<void> {
        if (isRunning()) {
            const choice = await select<'console' | 'restart' | 'stop' | 'back'>({
                header: () => [...title('Start'), ' El bot ya está en marcha: ' + statusLine()],
                options: [
                    { label: 'Ver consola', value: 'console', key: '1' },
                    { label: 'Reiniciar bot', value: 'restart', key: '2' },
                    { label: 'Detener bot', value: 'stop', key: '3' },
                    { label: 'Volver', value: 'back', key: '0' }
                ],
                back: 'back'
            });
            if (choice === 'back') return;
            if (choice === 'stop') {
                await stopBot();
                return;
            }
            if (choice === 'restart') await restartBot();
            return openConsole();
        }

        const installed = await ensureDependencies();
        if (!installed) return;
        const options = await askLinkOptions();
        if (!options) return;
        startBot(options);
        return openConsole();
    }

    // ───────────────────────── consola y dashboard ─────────────────────────

    function miniStats(): string {
        const rt = bot.runtime;
        const parts: string[] = [];
        if (stats) {
            parts.push(`${c.dim('Usuarios')} ${c.white(fmtNumber(stats.users))}`);
            parts.push(`${c.dim('Grupos')} ${c.white(fmtNumber(stats.groups))}`);
        }
        if (rt) parts.push(`${c.dim('Cmds')} ${c.white(fmtNumber(rt.commands))}`);
        if (stats) parts.push(`${c.dim('Datos')} ${c.white(fmtBytes(stats.storage.userData))}`);
        return ' ' + parts.join(c.dim(' · '));
    }

    function dashboardLines(): string[] {
        const settings = loadSettings();
        const rt = bot.runtime;
        const s = stats;
        const lines: string[] = [];
        const section = (name: string) => lines.push('', ' ' + c.accentBold(name));
        const row = (label: string, value: string) => lines.push(field(' ' + label, value, 13));
        const barSize = Math.max(8, Math.min(20, cols() - 34));

        lines.push(' ' + c.accentBold('BOT'));
        row('Estado', statusText());
        row('Nombre', c.white(settings.botName));
        if (rt?.number) row('Número', c.white(phone(rt.number)) + (rt.name ? c.dim(` (${rt.name})`) : ''));
        row('Sesión', c.white(bot.session || settings.activeSession));
        if (isRunning()) {
            row('Encendido', c.white(fmtDuration(Date.now() - bot.startedAt)) +
                (rt?.connectedAt ? c.dim(' · conectado ') + c.white(fmtDuration(Date.now() - rt.connectedAt)) : ''));
            row('Proceso', c.dim('PID ') + c.white(String(bot.child?.pid ?? '-')) +
                (rt ? c.dim(' · RAM ') + c.white(fmtBytes(rt.rss)) : ''));
            if (rt) row('Plugins', c.white(String(rt.plugins)) + c.dim(' comandos cargados'));
        }

        section('USUARIOS');
        if (!s) {
            row('Cargando', c.dim('…'));
        } else if (!s.dbAvailable) {
            row('Registrados', c.dim('0 (la base de datos se crea al iniciar el bot)'));
        } else {
            row('Registrados', c.white(fmtNumber(s.users)));
            row('Activos', c.white(fmtNumber(s.active24h)) + c.dim(' en 24 h · ') + c.white(fmtNumber(s.active7d)) + c.dim(' en 7 días'));
            row('Chats', c.white(fmtNumber(s.groups)) + c.dim(' grupos · ') + c.white(fmtNumber(s.privateChats)) + c.dim(' privados'));
            row('Monedas', c.white(fmtNumber(s.totalCoins)) + c.dim(` ${settings.coin} en circulación`));
        }

        section('ACTIVIDAD');
        row('Comandos', c.white(fmtNumber(s?.totalCommands ?? 0)) + c.dim(' en total · ') +
            c.white(fmtNumber(rt?.commands ?? 0)) + c.dim(' esta sesión'));
        row('Mensajes', c.white(fmtNumber(s?.totalMessages ?? 0)) + c.dim(' en total · ') +
            c.white(fmtNumber(rt?.messages ?? 0)) + c.dim(' esta sesión'));
        row('Errores', (rt?.errors ? c.red(String(rt.errors)) : c.white('0')) + c.dim(' esta sesión'));
        if (rt?.topCommands?.length) {
            row('Más usados', rt.topCommands.map(([name, count]) => c.white(name) + c.dim(`×${count}`)).join(' '));
        }

        section('ALMACENAMIENTO');
        if (s) {
            row('Usuarios', c.white(fmtBytes(s.storage.userData)) + c.dim(' · ≈ ') + c.white(fmtBytes(s.storage.perUser)) + c.dim(' por usuario'));
            row('Base datos', c.white(fmtBytes(s.storage.database)));
            row('Sesiones', c.white(fmtBytes(s.storage.sessions)));
            row('Bot', c.white(fmtBytes(s.storage.project)) + c.dim(' (sin node_modules)'));
            if (s.storage.diskTotal) {
                const used = s.storage.diskTotal - s.storage.diskFree;
                row('Disco', bar(used / s.storage.diskTotal, barSize) + ' ' + c.white(fmtBytes(s.storage.diskFree)) + c.dim(' libres'));
            }
        }

        if (s?.topUsers.length) {
            section('USUARIOS QUE MÁS ESPACIO OCUPAN');
            const top = s.topUsers[0]!.bytes || 1;
            s.topUsers.forEach((user, i) => {
                const name = (user.name && user.name !== 'Usuario' ? user.name : phone(user.id.split('@')[0]!)).slice(0, 16);
                lines.push(`  ${c.dim(i + 1 + '.')} ${pad(c.white(name), 16)} ${bar(user.bytes / top, 6)} ` +
                    `${c.white(fmtBytes(user.bytes))}${c.dim(` · ${user.chats} chats`)}`);
            });
        }

        section('SISTEMA');
        if (s) {
            row('RAM', bar(s.system.memUsed / s.system.memTotal, barSize) + ' ' +
                c.white(fmtBytes(s.system.memUsed)) + c.dim(' / ' + fmtBytes(s.system.memTotal)));
            row('CPU', c.white(s.system.load.toFixed(2)) + c.dim(` carga · ${s.system.cpus} núcleos`));
            row('Entorno', c.dim(`Node ${s.system.node} · ${s.system.platform}`));
        }
        return lines;
    }

    /** Consola del bot. Devuelve 'start' si el usuario pide iniciar un bot detenido. */
    function consoleView(initial: 'logs' | 'dash' = 'logs'): Promise<'menu' | 'start'> {
        return show<'menu' | 'start'>(done => {
            let mode: 'logs' | 'dash' | 'qr' = bot.qrText ? 'qr' : initial;
            let qrDismissed = false;
            let scroll = 0;
            let dashScroll = 0;
            let seenSeq = bot.logSeq;
            let pending: 'restart' | 'stop' | null = null;

            const onUpdate = () => scheduleDraw();
            const onQr = () => {
                if (!qrDismissed) mode = 'qr';
                scheduleDraw();
            };
            const onNeedLink = () => finish('menu');

            bot.events.on('update', onUpdate);
            bot.events.on('qr', onQr);
            bot.events.on('need_link', onNeedLink);

            function finish(result: 'menu' | 'start'): void {
                bot.events.off('update', onUpdate);
                bot.events.off('qr', onQr);
                bot.events.off('need_link', onNeedLink);
                done(result);
            }

            function header(): string[] {
                const lines = [' ' + c.accentBold('DENJI BOT') + '  ' + statusLine(), miniStats()];
                if (bot.pairingCode && bot.runtime?.status !== 'connected') {
                    lines.push(
                        ' ' + c.dim('Código de vinculación:') + ' ' + c.inverse(` ${bot.pairingCode} `),
                        ' ' + c.dim('WhatsApp › Dispositivos vinculados ›'),
                        ' ' + c.dim('Vincular con el número de teléfono')
                    );
                }
                lines.push(' ' + rule());
                return lines;
            }

            function footer(): string[] {
                if (pending) {
                    const question = pending === 'restart' ? '¿Reiniciar el bot?' : '¿Detener el bot?';
                    return [' ' + rule(), ' ' + c.yellow(question) + c.dim('  Enter = sí · otra tecla = no')];
                }
                const k = (key: string, label: string) => c.accentBold(key) + c.dim(' ' + label);
                const first = mode === 'dash' ? k('L', 'logs') : k('D', 'dashboard');
                const keys = isRunning()
                    ? [first, k('M', 'menú'), k('R', 'reiniciar'), k('X', 'detener')]
                    : [first, k('M', 'menú'), k('R', 'iniciar')];
                if (bot.qrText && mode !== 'qr') keys.push(k('Q', 'QR'));
                const second = mode === 'logs' && scroll > 0
                    ? c.yellow('▲ Viendo historial') + c.dim(' · F volver al final')
                    : c.dim('↑↓ desplazar');
                return [' ' + rule(), ' ' + keys.join(c.dim(' · ')), ' ' + second];
            }

            // El QR usa toda la pantalla: necesita cada fila y columna disponible.
            function qrScreen(): string[] {
                const qr = bot.qrText.split('\n');
                const widest = Math.max(...qr.map(line => line.replace(/\u001b\[[0-9;]*m/g, '').length));
                const keys = ' ' + c.accentBold('L') + c.dim(' logs · ') + c.accentBold('M') + c.dim(' menú · se renueva solo');
                const lines = [
                    ' ' + c.accentBold('DENJI BOT') + c.dim(' › ') + c.bold('Escanea el código QR'),
                    ...para('WhatsApp › Dispositivos vinculados › Vincular un dispositivo', c.dim)
                ];
                if (widest > cols() || lines.length + qr.length + 1 > rows()) {
                    lines.push(...para('El QR no cabe en pantalla: aleja el zoom pellizcando la pantalla, o usa el código de 8 dígitos.', c.yellow));
                    lines.push(keys, ...qr);
                } else {
                    lines.push(...qr, keys);
                }
                return lines;
            }

            function body(room: number): string[] {
                if (mode === 'dash') {
                    const all = dashboardLines();
                    dashScroll = Math.max(0, Math.min(dashScroll, Math.max(0, all.length - room)));
                    return all.slice(dashScroll, dashScroll + room);
                }

                const total = bot.logs.length;
                const maxScroll = Math.max(0, total - room);
                if (scroll > 0) scroll += bot.logSeq - seenSeq;
                seenSeq = bot.logSeq;
                scroll = Math.max(0, Math.min(scroll, maxScroll));
                const end = total - scroll;
                const lines = bot.logs.slice(Math.max(0, end - room), end);
                if (!lines.length) {
                    lines.push(' ' + c.dim(isRunning() ? 'Esperando actividad…' : 'El bot está detenido. Pulsa R para iniciarlo.'));
                }
                return lines;
            }

            return {
                tick: 1000,
                onTick: () => refreshStats(5000),
                render() {
                    if (mode === 'qr' && !bot.qrText) mode = 'logs';
                    if (mode === 'qr') return qrScreen();
                    const head = header();
                    const foot = footer();
                    const room = Math.max(1, rows() - head.length - foot.length);
                    const lines = body(room).slice(0, room);
                    while (lines.length < room) lines.push('');
                    return [...head, ...lines, ...foot];
                },
                onKey(key) {
                    const name = key.name || '';

                    if (pending) {
                        const action = pending;
                        pending = null;
                        if (name === 'return' || name === 'enter') {
                            if (action === 'restart') restartBot().catch(() => {});
                            else stopBot().catch(() => {});
                        }
                        return draw();
                    }

                    const page = Math.max(1, rows() - 10);
                    const move = (delta: number) => {
                        if (mode === 'dash') dashScroll = Math.max(0, dashScroll - delta);
                        else if (mode === 'logs') scroll = Math.max(0, scroll + delta);
                        draw();
                    };

                    switch (name) {
                        case 'm':
                        case 'escape':
                            return finish('menu');
                        case 'd':
                            mode = 'dash';
                            if (bot.qrText) qrDismissed = true;
                            refreshStats(0);
                            return draw();
                        case 'l':
                        case 'c':
                            mode = 'logs';
                            if (bot.qrText) qrDismissed = true;
                            return draw();
                        case 'q':
                            if (bot.qrText) {
                                mode = 'qr';
                                qrDismissed = false;
                            }
                            return draw();
                        case 'r':
                            if (!isRunning()) return finish('start');
                            pending = 'restart';
                            return draw();
                        case 'x':
                            if (isRunning()) pending = 'stop';
                            return draw();
                        case 'up':
                        case 'k':
                            return move(1);
                        case 'down':
                        case 'j':
                            return move(-1);
                        case 'pageup':
                            return move(page);
                        case 'pagedown':
                        case 'space':
                            return move(-page);
                        case 'home':
                        case 'g':
                            if (mode === 'dash') dashScroll = 0;
                            else scroll = bot.logs.length;
                            return draw();
                        case 'f':
                        case 'end':
                            scroll = 0;
                            dashScroll = mode === 'dash' ? Number.MAX_SAFE_INTEGER : dashScroll;
                            return draw();
                    }
                }
            };
        });
    }

    async function openConsole(initial: 'logs' | 'dash' = 'logs'): Promise<void> {
        let mode = initial;
        while (true) {
            const result = await consoleView(mode);
            if (result !== 'start') return;
            const options = await askLinkOptions();
            if (!options) return;
            startBot(options);
            mode = 'logs';
        }
    }

    // ───────────────────────── sesiones ─────────────────────────

    /** Detiene el bot si está usando alguna de las sesiones indicadas. */
    async function stopIfUsing(names: string[]): Promise<void> {
        if (isRunning() && names.includes(bot.session)) await stopBot();
    }

    async function removeSessions(names: string[]): Promise<void> {
        if (!names.length) return;
        const using = isRunning() && names.includes(bot.session);
        const what = names.length === 1 ? `la sesión "${names[0]}"` : `${names.length} sesiones`;

        const ok = await confirm(
            () => [
                ...title('Eliminar sesiones'),
                ...para(`Vas a borrar ${what}.`),
                ...para('Tendrás que vincular WhatsApp de nuevo para usarla.', c.dim),
                ...(using ? para('El bot está usando esta sesión y se detendrá.', c.yellow) : [])
            ],
            '¿Eliminar definitivamente?',
            'Sí, eliminar',
            'No, cancelar'
        );
        if (!ok) return;

        await stopIfUsing(names);
        const failed = names.filter(name => !deleteSession(name));
        if (!failed.length) bot.notice = '';

        await message(() => [
            ...title('Eliminar sesiones'),
            failed.length
                ? ' ' + c.red(`No se pudo eliminar: ${failed.join(', ')}`)
                : ' ' + c.green(`✔ ${names.length === 1 ? 'Sesión eliminada' : 'Sesiones eliminadas'}: ${names.join(', ')}`)
        ]);
    }

    async function useSession(name: string): Promise<void> {
        const running = isRunning();
        if (running) {
            const ok = await confirm(
                () => [...title('Sesiones'), ...para(`El bot está encendido con la sesión "${bot.session}".`)],
                `¿Cambiar a "${name}" y reiniciar el bot?`
            );
            if (!ok) return;
            await stopBot();
        }
        saveSettings({ activeSession: name });
        bot.notice = '';

        if (running) {
            const options = await askLinkOptions();
            if (options) {
                startBot(options);
                await openConsole();
            }
        }
    }

    async function sessionDetail(name: string): Promise<void> {
        while (true) {
            const session = readSession(name);
            const inUse = isRunning() && bot.session === name;
            type Choice = 'use' | 'delete' | 'back';
            const options: { label: string; hint?: string; value: Choice; key: string }[] = [];
            if (!session.active) options.push({ label: 'Usar esta sesión', hint: 'Marcarla como activa', value: 'use', key: '1' });
            if (session.exists) options.push({ label: 'Eliminar sesión', hint: 'Borrar la vinculación', value: 'delete', key: '2' });
            options.push({ label: 'Volver', value: 'back', key: '0' });

            const choice = await select<Choice>({
                header: () => [
                    ...title(`Sesiones › ${name}`),
                    field('Estado', (session.registered ? c.green('Vinculada') : c.yellow('Sin vincular')) +
                        (session.active ? c.dim(' · ') + c.accent('activa') : '') +
                        (inUse ? c.dim(' · ') + c.green('en uso') : '')),
                    field('Número', session.number ? c.white(phone(session.number)) : c.dim('—')),
                    field('Nombre', session.pushName && session.pushName !== '~' ? c.white(session.pushName) : c.dim('—')),
                    field('Archivos', c.white(fmtNumber(session.files)) + c.dim(' · ') + c.white(fmtBytes(session.size))),
                    field('Actividad', c.white(session.modified ? fmtAgo(session.modified) : '—')),
                    field('Carpeta', c.dim(path.relative(ROOT, session.dir) + path.sep))
                ],
                options,
                back: 'back'
            });

            if (choice === 'back') return;
            if (choice === 'use') await useSession(name);
            if (choice === 'delete') {
                await removeSessions([name]);
                if (!readSession(name).exists) return;
            }
        }
    }

    async function sessionsScreen(): Promise<void> {
        while (true) {
            const sessions = listSessions();
            const choice = await select<string>({
                header: () => [
                    ...title('Sesiones'),
                    ...para('Cada sesión es una cuenta de WhatsApp vinculada. El bot usa la marcada con ●.', c.dim)
                ],
                options: [
                    ...sessions.map((session, i) => ({
                        label: (session.active ? '● ' : '○ ') + session.name,
                        hint: describeSession(session),
                        value: 'session:' + session.name,
                        key: i < 8 ? String(i + 1) : undefined
                    })),
                    { label: '+ Nueva sesión', hint: 'Para vincular otra cuenta', value: 'new', key: 'n' },
                    { label: 'Volver', value: 'back', key: '0' }
                ],
                back: 'back'
            });

            if (choice === 'back') return;
            if (choice === 'new') {
                const name = await prompt({
                    header: () => title('Sesiones › Nueva'),
                    label: 'Nombre de la nueva sesión',
                    hint: 'Solo letras, números, guiones y guion bajo (máx. 24).',
                    maxLength: 24,
                    validate: value => {
                        if (!isValidSessionName(value)) return 'Nombre no válido.';
                        if (sessions.some(s => s.name === value)) return 'Ya existe una sesión con ese nombre.';
                        return null;
                    }
                });
                if (name) {
                    await useSession(name);
                    if (loadSettings().activeSession === name) {
                        await message(() => [
                            ...title('Sesiones'),
                            ...para(`✔ Sesión "${name}" creada y marcada como activa.`, c.green),
                            ...para('Usa "Start" para vincularla con QR o código.', c.dim)
                        ]);
                    }
                }
                continue;
            }
            await sessionDetail(choice.slice('session:'.length));
        }
    }

    async function deleteSessionsScreen(): Promise<void> {
        while (true) {
            const sessions = listSessions().filter(s => s.exists);
            if (!sessions.length) {
                return message(() => [...title('Eliminar sesiones'), ' ' + c.dim('No hay sesiones guardadas.')]);
            }

            const choice = await select<string>({
                header: () => [...title('Eliminar sesiones'), ' ' + c.dim('Elige qué sesión quieres borrar.')],
                options: [
                    ...sessions.map((session, i) => ({
                        label: (session.active ? '● ' : '○ ') + session.name,
                        hint: describeSession(session),
                        value: 'session:' + session.name,
                        key: i < 8 ? String(i + 1) : undefined
                    })),
                    ...(sessions.length > 1
                        ? [{ label: 'Eliminar TODAS', hint: `${sessions.length} sesiones`, value: 'all', key: 't' }]
                        : []),
                    { label: 'Volver', value: 'back', key: '0' }
                ],
                back: 'back'
            });

            if (choice === 'back') return;
            await removeSessions(choice === 'all' ? sessions.map(s => s.name) : [choice.slice('session:'.length)]);
            resetStatsCache();
        }
    }

    // ───────────────────────── eliminar datos ─────────────────────────

    async function wipeDataScreen(): Promise<void> {
        type WipeChoice = 'all' | 'keepSession' | 'database' | 'subs' | 'settings' | 'temp' | 'back';

        const DESCRIPTIONS: Record<Exclude<WipeChoice, 'back'>, { name: string; preview: string; stopsBot: boolean; restartsBot: boolean }> = {
            all: {
                name: 'TODOS los datos del bot',
                preview: 'Borra base de datos, todas las sesiones de WhatsApp, sub-bots, ajustes (settings.json), caché y logs. Deja el bot como recién instalado.',
                stopsBot: true,
                restartsBot: false
            },
            keepSession: {
                name: 'datos, sub-bots y ajustes (sin cerrar sesión)',
                preview: 'Borra base de datos, sub-bots, caché y restablece ajustes, conservando la sesión activa de WhatsApp y los dueños configurados.',
                stopsBot: true,
                restartsBot: true
            },
            database: {
                name: 'la base de datos y caché',
                preview: 'Borra usuarios, grupos, economía, gacha, niveles, perfiles, warns y packs de stickers. Conserva las sesiones, sub-bots y ajustes.',
                stopsBot: true,
                restartsBot: true
            },
            subs: {
                name: 'todas las sesiones de sub-bots',
                preview: 'Borra la carpeta Sessions/ con todos los sub-bots vinculados. Conserva la sesión principal, la base de datos y los ajustes.',
                stopsBot: true,
                restartsBot: true
            },
            settings: {
                name: 'los ajustes personalizados (settings.json)',
                preview: 'Elimina settings.json (nombre, prefijo, moneda, estilo del menú, reacciones y dueños). Conserva la base de datos y las sesiones.',
                stopsBot: false,
                restartsBot: false
            },
            temp: {
                name: 'la caché temporal y los logs',
                preview: 'Limpia tmp/, logs/, archivos .log y el historial de consola del panel sin tocar sesiones, ajustes ni base de datos.',
                stopsBot: false,
                restartsBot: false
            }
        };

        while (true) {
            const info = inspectBotData();
            const dbHint = info.database.exists
                ? `${fmtBytes(info.database.bytes)} · ${fmtNumber(info.database.users)} usuarios, ${fmtNumber(info.database.groups)} grupos`
                : 'vacía';
            const sessHint = info.sessions.exists
                ? `${info.sessions.count} · ${fmtBytes(info.sessions.bytes)}`
                : 'ninguna';
            const subsHint = info.subs.exists
                ? `${info.subs.count} · ${fmtBytes(info.subs.bytes)}`
                : 'ninguno';
            const setHint = info.settings.exists ? fmtBytes(info.settings.bytes) : 'por defecto';
            const tmpHint = info.temp.exists
                ? `${info.temp.files} archivo(s) · ${fmtBytes(info.temp.bytes)}`
                : bot.logs.length ? `${bot.logs.length} líneas en consola` : 'limpio';

            const options: { label: string; hint: string; value: WipeChoice; key: string }[] = [
                { label: 'Eliminar TODOS los datos', hint: info.hasAnyData ? `Fábrica · ${fmtBytes(info.totalBytes)}` : 'sin datos', value: 'all', key: '1' },
                { label: 'Datos sin cerrar sesión', hint: 'Conserva sesión y dueños', value: 'keepSession', key: '2' },
                { label: 'Solo base de datos', hint: info.database.exists ? fmtBytes(info.database.bytes) : 'vacía', value: 'database', key: '3' },
                { label: 'Solo sub-bots', hint: subsHint, value: 'subs', key: '4' },
                { label: 'Solo ajustes', hint: setHint, value: 'settings', key: '5' },
                { label: 'Solo caché y logs', hint: tmpHint, value: 'temp', key: '6' },
                { label: 'Volver', hint: '', value: 'back', key: '0' }
            ];

            const choice = await select<WipeChoice>({
                header: () => [
                    ...title('Eliminar datos'),
                    field('Base datos', info.database.exists ? c.white(dbHint) : c.dim('vacía'), 11),
                    field('Sesiones', info.sessions.exists ? c.white(sessHint) : c.dim('ninguna'), 11),
                    field('Sub-Bots', info.subs.exists ? c.white(subsHint) : c.dim('ninguno'), 11),
                    field('Ajustes', info.settings.exists ? c.white(setHint) : c.dim('por defecto'), 11),
                    field('Temporales', info.temp.exists ? c.white(tmpHint) : c.dim(tmpHint), 11),
                    field('Total', info.totalBytes ? c.bold(fmtBytes(info.totalBytes)) : c.dim('0 B'), 11)
                ],
                options,
                back: 'back',
                preview: value => (value === 'back' ? [] : para(DESCRIPTIONS[value].preview, c.dim))
            });

            if (choice === 'back') return;

            if (choice === 'temp') {
                const res = wipeBotData(WIPE_PRESETS.temp);
                clearBotLogs();
                resetStatsCache();
                await message(() => [
                    ...title('Eliminar datos › Caché y logs'),
                    res.ok
                        ? ' ' + c.green(`✔ Caché y logs limpiados (${fmtBytes(res.freedBytes)} liberados).`)
                        : ' ' + c.red(`✖ No se pudo limpiar: ${res.failed.join(', ')}`)
                ]);
                continue;
            }

            if (choice === 'all' && !info.hasAnyData && !bot.logs.length) {
                await message(() => [...title('Eliminar datos'), ' ' + c.dim('No hay datos guardados para eliminar.')]);
                continue;
            }
            if (choice === 'database' && !info.database.exists && !info.temp.exists) {
                await message(() => [...title('Eliminar datos'), ' ' + c.dim('La base de datos ya está vacía.')]);
                continue;
            }
            if (choice === 'subs' && !info.subs.exists) {
                await message(() => [...title('Eliminar datos'), ' ' + c.dim('No hay sesiones de sub-bots guardadas.')]);
                continue;
            }
            if (choice === 'settings' && !info.settings.exists) {
                await message(() => [...title('Eliminar datos'), ' ' + c.dim('No hay archivo settings.json guardado.')]);
                continue;
            }

            const meta = DESCRIPTIONS[choice];
            const wasRunning = isRunning();
            const warnLines: string[] = [];
            if (choice === 'all') {
                warnLines.push(...para('! Esta acción es irreversible: se perderán usuarios, monedas, personajes, ajustes y vinculaciones de WhatsApp.', c.red));
            } else {
                warnLines.push(...para(meta.preview, c.dim));
            }
            if (wasRunning && meta.stopsBot) {
                warnLines.push(
                    ...para(
                        meta.restartsBot
                            ? 'El bot se reiniciará automáticamente para aplicar la limpieza.'
                            : 'El bot se detendrá y tendrás que vincularlo de nuevo desde "Start".',
                        c.yellow
                    )
                );
            }

            const ok = await confirm(
                () => [
                    ...title('Eliminar datos › Confirmar'),
                    ...para(`Vas a eliminar ${meta.name}.`),
                    ...warnLines
                ],
                '¿Eliminar definitivamente? (no se puede deshacer)',
                'Sí, eliminar',
                'No, cancelar'
            );
            if (!ok) continue;

            // Doble confirmación para el restablecimiento total de fábrica.
            if (choice === 'all') {
                const typed = await prompt({
                    header: () => [
                        ...title('Eliminar datos › Confirmación final'),
                        ...para('Se borrarán la base de datos, todas las sesiones, sub-bots, ajustes y registros.', c.yellow)
                    ],
                    label: 'Escribe BORRAR para confirmar',
                    hint: 'Pulsa Esc para cancelar sin borrar nada.',
                    maxLength: 16,
                    validate: value => (value.toUpperCase() === 'BORRAR' ? null : 'Escribe exactamente BORRAR o pulsa Esc para cancelar.')
                });
                if (typed === null) continue;
            }

            if (wasRunning && meta.stopsBot) {
                await stopBot();
            }

            const res = wipeBotData(WIPE_PRESETS[choice]);
            if (choice === 'all' || choice === 'keepSession') {
                clearBotLogs();
                bot.notice = '';
                bot.qrText = '';
                bot.pairingCode = '';
            }
            panelLog(
                res.ok
                    ? `Datos eliminados: ${res.removed.join(', ') || meta.name} (${fmtBytes(res.freedBytes)}).`
                    : `Error al eliminar datos: ${res.failed.join(', ')}.`
            );

            if (wasRunning && meta.stopsBot && meta.restartsBot && readSession(loadSettings().activeSession).registered) {
                startBot();
            }

            resetStatsCache();

            await message(() => [
                ...title('Eliminar datos'),
                ...(res.ok
                    ? [
                        ...para(`✔ Eliminado correctamente (${fmtBytes(res.freedBytes)} liberados).`, c.green),
                        ...(res.removed.length ? para('Elementos: ' + res.removed.join(' · '), c.dim) : []),
                        ...(choice === 'all' ? para('El bot quedó limpio como recién instalado. Usa "Start" para vincularlo.', c.dim) : [])
                    ]
                    : para(`✖ No se pudo eliminar: ${res.failed.join(', ')}`, c.red))
            ]);

            if (choice === 'all') return;
        }
    }

    // ───────────────────────── actualizar ─────────────────────────

    function run(command: string, args: string[], onLine?: (line: string) => void, timeoutMs = 300_000): Promise<{ code: number; output: string }> {
        return new Promise(resolve => {
            let output = '';
            let partial = '';
            let settled = false;
            const finish = (code: number) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (partial) onLine?.(partial);
                resolve({ code, output });
            };

            const child = spawn(command, args, {
                cwd: ROOT,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1', FORCE_COLOR: '0' },
                stdio: ['ignore', 'pipe', 'pipe']
            });
            const timer = setTimeout(() => {
                onLine?.('Tiempo de espera agotado.');
                try {
                    child.kill('SIGKILL');
                } catch {}
            }, timeoutMs);

            const feed = (chunk: Buffer) => {
                const text = chunk.toString('utf8').replace(/\r/g, '\n');
                output += text;
                const parts = (partial + text).split('\n');
                partial = parts.pop() ?? '';
                for (const part of parts) if (part.trim()) onLine?.(part);
            };
            child.stdout?.on('data', feed);
            child.stderr?.on('data', feed);
            child.on('error', error => {
                onLine?.(`No se pudo ejecutar ${command}: ${error.message}`);
                finish(127);
            });
            child.on('close', code => finish(code ?? 1));
        });
    }

    /** Ejecuta una tarea mostrando su salida en vivo; al terminar espera una tecla. */
    function taskScreen<T>(section: string, task: (log: (line: string) => void) => Promise<T>): Promise<T> {
        return show<T>(done => {
            const output: string[] = [];
            let finished = false;
            let result: T;

            const log = (line: string) => {
                output.push(' ' + line.replace(/\u001b\[[0-9;?]*[ -/]*[@-ln-~]/g, ''));
                scheduleDraw();
            };

            task(log)
                .then(value => {
                    result = value;
                })
                .catch(error => {
                    log(c.red(`Error: ${error?.message || error}`));
                })
                .finally(() => {
                    finished = true;
                    draw();
                });

            return {
                render() {
                    const head = title(section);
                    const foot = ['', ' ' + (finished ? c.dim('Pulsa una tecla para continuar') : c.yellow('Trabajando…'))];
                    const room = Math.max(1, rows() - head.length - foot.length);
                    return [...head, ...output.slice(-room), ...foot];
                },
                onKey() {
                    if (finished) done(result);
                }
            };
        });
    }

    function findMissingDependencies(): string[] {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
            const deps = Object.keys(pkg?.dependencies || {});
            return deps.filter(name => !fs.existsSync(path.join(ROOT, 'node_modules', ...name.split('/'), 'package.json')));
        } catch {
            return [];
        }
    }

    async function installDependencies(section: string): Promise<boolean> {
        const sharedStorage = /^\/(sdcard|storage)\//.test(ROOT);
        const args = ['install', '--no-audit', '--no-fund', ...(sharedStorage ? ['--no-bin-links'] : [])];
        return taskScreen(section, async log => {
            log(c.dim(`$ npm ${args.join(' ')}`));
            const npm = await run('npm', args, log, 900_000);
            log('');
            log(npm.code === 0 ? c.green('✔ Dependencias instaladas.') : c.red('✖ npm install terminó con errores.'));
            return npm.code === 0;
        });
    }

    async function ensureDependencies(): Promise<boolean> {
        const missing = findMissingDependencies();
        if (!missing.length) return true;
        const shown = missing.slice(0, 5).join(', ') + (missing.length > 5 ? ` (+${missing.length - 5} más)` : '');
        const install = await confirm(
            () => [
                ...title('Dependencias faltantes'),
                ...para(`Faltan paquetes en node_modules: ${shown}.`, c.yellow)
            ],
            '¿Instalar dependencias ahora? (npm install)',
            'Sí, instalar',
            'Cancelar'
        );
        if (!install) return false;
        return installDependencies('Dependencias › npm install');
    }

    async function updateScreen(): Promise<void> {
        if (!fs.existsSync(path.join(ROOT, '.git'))) {
            return message(() => [
                ...title('Actualizar bot'),
                ...para('Este bot no se instaló con git clone, así que no se puede actualizar con git pull.', c.yellow)
            ]);
        }

        const head = async (): Promise<string> => (await run('git', ['rev-parse', 'HEAD'])).output.trim();

        const result = await taskScreen('Actualizar bot', async log => {
            const before = await head();
            log(c.dim('$ git pull'));
            const pull = await run('git', ['pull'], log);
            const after = await head();

            if (pull.code !== 0) {
                log('');
                log(c.red('✖ git pull terminó con errores.'));
                log(c.dim('Si modificaste archivos del bot, guarda tus cambios'));
                log(c.dim('(git stash) y vuelve a intentarlo.'));
                return { changed: [] as string[], updated: false };
            }
            if (!before || before === after) {
                log('');
                log(c.green('✔ Ya tienes la última versión.'));
                return { changed: [] as string[], updated: false };
            }

            const changed = (await run('git', ['diff', '--name-only', before, after])).output.split('\n').filter(Boolean);
            const commits = (await run('git', ['log', '--oneline', '-n', '8', `${before}..${after}`])).output.split('\n').filter(Boolean);
            log('');
            log(c.green(`✔ Bot actualizado: ${changed.length} archivo(s) cambiaron.`));
            for (const commit of commits) log(c.dim('  ' + commit));
            return { changed, updated: true };
        });

        if (!result?.updated) return;
        const changed = result.changed;

        const missingAfterPull = findMissingDependencies();
        if (changed.includes('package.json') || missingAfterPull.length > 0) {
            const install = await confirm(
                () => [
                    ...title('Actualizar bot'),
                    ...para(
                        missingAfterPull.length > 0
                            ? `Faltan dependencias nuevas (${missingAfterPull.slice(0, 5).join(', ')}).`
                            : 'La actualización cambió las dependencias (package.json).'
                    )
                ],
                '¿Instalar dependencias ahora? (npm install)',
                'Sí, instalar',
                'Ahora no'
            );
            if (install) {
                await installDependencies('Actualizar bot › npm install');
            }
        }

        if (isRunning()) {
            const restart = await confirm(
                () => [...title('Actualizar bot'), ...para('El bot está encendido con la versión anterior.')],
                '¿Reiniciar el bot para aplicar la actualización?'
            );
            if (restart) await restartBot();
        }

        const panelFiles = ['launcher.ts', 'package.json', 'lib/settings.ts', 'lib/sessions.ts', 'lib/stats.ts', 'lib/bridge.ts', 'lib/wipe.ts'];
        if (changed.some(file => panelFiles.includes(file) || file.startsWith('lib/panel/'))) {
            await message(() => [
                ...title('Actualizar bot'),
                ' ' + c.yellow('El panel también se actualizó.'),
                ...para('Sal y vuelve a ejecutar "npm start" para usar la nueva versión.')
            ]);
        }
    }

    // ───────────────────────── personalizar ─────────────────────────

    async function editText(section: string, label: string, hint: string, current: string, maxLength: number,
        validate?: (value: string) => string | null): Promise<string | null> {
        return prompt({
            header: () => [...title(`Personalizar › ${section}`), ' ' + c.dim('Actual: ') + c.white(current || '—')],
            label,
            hint,
            initial: current,
            maxLength,
            validate: value => (!value ? 'No puede quedar vacío.' : validate ? validate(value) : null)
        });
    }

    async function ownersScreen(): Promise<void> {
        while (true) {
            const owners = loadSettings().owners;
            const choice = await select<string>({
                header: () => [
                    ...title('Personalizar › Dueños'),
                    ...para('Los dueños pueden usar los comandos de administración del bot y aparecen en el comando de contacto.', c.dim),
                    ...(owners.length ? [] : ['', ' ' + c.yellow('Todavía no hay ningún dueño.')])
                ],
                options: [
                    ...owners.map(number => ({ label: phone(number), hint: 'Enter para quitar', value: 'remove:' + number })),
                    { label: '+ Añadir número', value: 'add', key: 'a' },
                    { label: 'Volver', value: 'back', key: '0' }
                ],
                back: 'back'
            });

            if (choice === 'back') return;
            if (choice === 'add') {
                const number = await prompt({
                    header: () => title('Personalizar › Dueños'),
                    label: 'Número del dueño',
                    hint: 'Con código de país, sin + ni espacios. Ej: 59899123456',
                    maxLength: 24,
                    validate: value => {
                        const digits = cleanNumber(value);
                        if (digits.length < 8 || digits.length > 15) return 'Escribe un número válido (8 a 15 dígitos).';
                        if (owners.includes(digits)) return 'Ese número ya es dueño.';
                        return null;
                    }
                });
                if (number) saveSettings({ owners: [...owners, cleanNumber(number)] });
                continue;
            }

            const number = choice.slice('remove:'.length);
            const ok = await confirm(() => title('Personalizar › Dueños'), `¿Quitar a ${phone(number)} de los dueños?`);
            if (ok) saveSettings({ owners: owners.filter(n => n !== number) });
        }
    }

    const bannerProblem = (value: string): string | null => {
        if (/^https?:\/\//i.test(value)) return null;
        const abs = path.isAbsolute(value) ? value : path.join(ROOT, value);
        return fs.existsSync(abs) && fs.statSync(abs).isFile() ? null : 'No existe ese archivo.';
    };

    // Símbolos decorativos de los menús que una terminal no sabe dibujar.
    const EXOTIC = /[\u0591-\u05c7\u0600-\u06ff\u0980-\u0b7f\u1800-\u180f\u115f\u3164\u200e\uabc0-\uabff\ufe20-\ufe2f\u{11000}-\u{1107f}\u{13000}-\u{1342f}\u{1d000}-\u{1d24f}]/gu;

    /** Convierte un texto con formato de WhatsApp en líneas para la terminal. */
    function chatPreview(text: string): string[] {
        const max = Math.max(16, Math.min(cols() - 5, 56));
        const out: string[] = [];
        const paint = (line: string): string => line
            .replace(/\*`?([^*`]+)`?\*/g, (_m, inner: string) => c.bold(inner))
            .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, (_m, lead: string, inner: string) => lead + c.accent(inner))
            .replace(/[*`]/g, '');

        for (const raw of text.split('\n')) {
            const clean = raw.replace(EXOTIC, '').replace(/[ \u00a0]{2,}/g, ' ').trim();
            if (!clean) {
                if (out.length && out[out.length - 1] !== '') out.push('');
                continue;
            }
            // Se conserva la sangría de las líneas que empiezan con espacios normales.
            const indent = /^ +(?=[^\s])/.exec(raw)?.[0].slice(0, 3) ?? '';
            const quote = clean.startsWith('> ');
            const lead = quote ? c.dim('▎ ') : indent;
            const pieces = wrap(paint(quote ? clean.slice(2) : clean), max - (quote ? 2 : indent.length));
            for (const piece of pieces) out.push(lead + (quote ? c.dim(piece) : piece));
        }
        while (out.length && out[out.length - 1] === '') out.pop();
        return out.map(line => ' ' + c.dim('│ ') + line);
    }

    async function menuStyleScreen(): Promise<void> {
        type Choice = MenuTheme | 'banners' | 'back';
        let index = Math.max(0, MENU_THEMES.indexOf(loadSettings().menuTheme));

        while (true) {
            const s = loadSettings();
            const bannerOf = (theme: MenuTheme): string => s.menuBanners[theme] || 'banner principal';
            const options: { label: string; hint: string; value: Choice; key?: string }[] = [
                ...MENU_THEMES.map((theme, i) => ({
                    label: MENU_THEME_NAMES[theme],
                    hint: [s.menuTheme === theme ? '● en uso' : '', s.menuBanners[theme] ? 'banner propio' : ''].filter(Boolean).join(' · '),
                    value: theme as Choice,
                    key: i < 9 ? String(i + 1) : undefined
                })),
                { label: 'Banner de cada estilo', hint: 'Imagen del menú', value: 'banners', key: 'b' },
                { label: 'Volver', hint: '', value: 'back', key: '0' }
            ];

            const sample = (theme: MenuTheme): string[] => [
                ' ' + c.dim('┌ Ejemplo · ') + c.accent(MENU_THEME_NAMES[theme]),
                ...chatPreview(sampleMenu(theme, {
                    botName: s.botName,
                    devName: s.devName,
                    coin: s.coin,
                    prefix: s.prefix,
                    user: 'Lyan',
                    total: 140,
                    link: 'github.com/…/DenjiBot'
                }))
            ];

            const choice = await select<Choice>({
                header: () => [
                    ...title('Personalizar › Estilo del menú'),
                    ...para('Mueve la selección para ver un ejemplo de cada estilo y pulsa Enter para usarlo.', c.dim)
                ],
                options,
                initial: index,
                back: 'back',
                preview: value => (value === 'banners' || value === 'back' ? sample(s.menuTheme) : sample(value))
            });
            index = Math.max(0, options.findIndex(option => option.value === choice));

            if (choice === 'back') return;

            if (choice === 'banners') {
                const theme = await select<MenuTheme | null>({
                    header: () => [
                        ...title('Personalizar › Banner de cada estilo'),
                        ...para('Cada estilo puede tener su propia imagen. Si no tiene, usa el banner principal.', c.dim),
                        ' ' + c.dim('Banner principal: ') + c.white(s.banner)
                    ],
                    options: [
                        ...MENU_THEMES.map((item, i) => ({
                            label: MENU_THEME_NAMES[item],
                            hint: bannerOf(item),
                            value: item as MenuTheme | null,
                            key: i < 9 ? String(i + 1) : undefined
                        })),
                        { label: 'Volver', value: null, key: '0' }
                    ],
                    initial: Math.max(0, MENU_THEMES.indexOf(s.menuTheme)),
                    back: null
                });
                if (!theme) continue;

                const value = await prompt({
                    header: () => [
                        ...title(`Personalizar › Banner · ${MENU_THEME_NAMES[theme]}`),
                        ' ' + c.dim('Actual: ') + c.white(bannerOf(theme))
                    ],
                    label: 'Imagen del menú para este estilo',
                    hint: `Ruta dentro del bot (por ejemplo ${DEFAULT_BANNER}) o URL. Déjalo vacío para usar el banner principal.`,
                    initial: s.menuBanners[theme],
                    maxLength: 300,
                    validate: v => (v ? bannerProblem(v) : null)
                });
                if (value !== null) saveSettings({ menuBanners: { ...s.menuBanners, [theme]: value } });
                continue;
            }

            saveSettings({ menuTheme: choice });
        }
    }

    // Emojis habituales para elegir sin tener que escribirlos.
    const EMOJI_CHOICES = ['🕘', '⏳', '⌛', '🔄', '👀', '⭐️', '✅', '👍', '🔥', '❤️', '🪚', '❌', '⚠️', '🚫', '🔒', '❓'];

    /** Devuelve el emoji elegido, '' para quitar la reacción o `null` si se cancela. */
    async function pickEmoji(section: string, current: string, noneLabel = 'Sin reacción'): Promise<string | null> {
        const choice = await select<string | null>({
            header: () => [
                ...title(`Personalizar › ${section}`),
                ' ' + c.dim('Actual: ') + (current ? c.white(current) : c.dim('sin reacción'))
            ],
            options: [
                { label: 'Escribir otro emoji', hint: 'Con el teclado', value: 'type', key: 'e' },
                { label: noneLabel, value: '', key: 'x' },
                ...EMOJI_CHOICES.map(emoji => ({ label: emoji, value: emoji as string | null })),
                { label: 'Volver', value: null, key: '0' }
            ],
            // Con un emoji que no está en la lista, la selección empieza en "Escribir otro".
            initial: !current ? 1 : EMOJI_CHOICES.includes(current) ? EMOJI_CHOICES.indexOf(current) + 2 : 0,
            back: null
        });
        if (choice !== 'type') return choice;

        const typed = await prompt({
            header: () => title(`Personalizar › ${section}`),
            label: 'Emoji de la reacción',
            hint: 'Escribe o pega un solo emoji.',
            maxLength: 16,
            validate: value => (cleanEmoji(value) ? null : 'Tiene que ser un único emoji.')
        });
        return typed === null ? null : cleanEmoji(typed);
    }

    async function commandReactionsScreen(): Promise<void> {
        while (true) {
            const s = loadSettings();
            const entries = Object.entries(s.reactions.commands);
            const choice = await select<string>({
                header: () => [
                    ...title('Personalizar › Por comando'),
                    ...para(`Un comando con emoji propio reacciona con él al terminar, en lugar del de "Listo" (${s.reactions.events.done || 'sin reacción'}). Elige uno de la lista para cambiarlo o quitarlo.`, c.dim),
                    ...(entries.length ? [] : ['', ' ' + c.yellow('Todavía no hay ninguno.')])
                ],
                options: [
                    ...entries.map(([name, emoji]) => ({ label: s.prefix + name, hint: emoji, value: 'edit:' + name })),
                    { label: '+ Añadir comando', value: 'add', key: 'a' },
                    { label: 'Volver', value: 'back', key: '0' }
                ],
                back: 'back'
            });

            if (choice === 'back') return;

            let name = choice.startsWith('edit:') ? choice.slice(5) : '';
            if (choice === 'add') {
                if (entries.length >= MAX_COMMAND_REACTIONS) {
                    await message(() => [...title('Personalizar › Por comando'), ...para(`Ya hay ${MAX_COMMAND_REACTIONS} comandos con emoji propio. Quita alguno para añadir otro.`, c.yellow)]);
                    continue;
                }
                const typed = await prompt({
                    header: () => title('Personalizar › Por comando'),
                    label: 'Nombre del comando',
                    hint: `Sin el prefijo. Sirve cualquiera de sus nombres, por ejemplo: sticker, s, play, menu`,
                    maxLength: 32,
                    validate: value => (cleanCommandName(value) ? null : 'Escribe solo el nombre del comando (letras y números).')
                });
                if (!typed) continue;
                name = cleanCommandName(typed);
            }

            const emoji = await pickEmoji(`Reacción de ${s.prefix}${name}`, s.reactions.commands[name] || '', 'Quitar este comando');
            if (emoji === null) continue;

            const commands = { ...loadSettings().reactions.commands };
            if (emoji) commands[name] = emoji;
            else delete commands[name];
            saveSettings({ reactions: { ...loadSettings().reactions, commands } });
        }
    }

    async function reactionsScreen(): Promise<void> {
        type Choice = ReactionEvent | 'toggle' | 'commands' | 'back';
        let index = 0;

        while (true) {
            const s = loadSettings();
            const r = s.reactions;
            const count = Object.keys(r.commands).length;
            const options: { label: string; hint: string; value: Choice; key: string }[] = [
                { label: 'Reacciones', hint: r.enabled ? 'activadas' : 'desactivadas', value: 'toggle', key: '1' },
                ...REACTION_EVENTS.map((event, i) => ({
                    label: REACTION_EVENT_NAMES[event],
                    hint: r.events[event] || 'sin reacción',
                    value: event as Choice,
                    key: String(i + 2)
                })),
                { label: 'Por comando', hint: count ? `${count} con emoji propio` : 'ninguno', value: 'commands', key: 'c' },
                { label: 'Volver', hint: '', value: 'back', key: '0' }
            ];

            const choice = await select<Choice>({
                header: () => [
                    ...title('Personalizar › Reacciones'),
                    ...para('El bot reacciona con un emoji al mensaje de quien usa un comando.', c.dim)
                ],
                options,
                initial: index,
                back: 'back',
                preview: value => {
                    if (value === 'toggle') return para(r.enabled ? 'Enter para desactivar todas las reacciones.' : 'Enter para activarlas.', c.dim);
                    if (value === 'commands') return para('Emoji propio para comandos concretos (sustituye al de "Listo").', c.dim);
                    if (value === 'back') return [];
                    return para(REACTION_EVENT_HINTS[value], c.dim);
                }
            });
            index = Math.max(0, options.findIndex(option => option.value === choice));

            if (choice === 'back') return;
            if (choice === 'toggle') {
                saveSettings({ reactions: { ...r, enabled: !r.enabled } });
            } else if (choice === 'commands') {
                await commandReactionsScreen();
            } else {
                const emoji = await pickEmoji(REACTION_EVENT_NAMES[choice], r.events[choice]);
                if (emoji !== null) saveSettings({ reactions: { ...r, events: { ...r.events, [choice]: emoji } } });
            }
        }
    }

    async function pickTikTokTargetScreen(): Promise<void> {
        const known = await listKnownChats();
        const s = loadSettings();
        const cur = s.tiktokS2.targetJid;

        type PickVal =
            | { kind: 'chat'; jid: string; label: string }
            | { kind: 'phone' }
            | { kind: 'groupjid' }
            | { kind: 'clear' }
            | null;

        const options: { label: string; hint?: string; value: PickVal; key?: string }[] = [];

        for (const item of known) {
            const kindTag = item.isGroup ? 'Grupo' : 'Chat';
            const displayName = item.name || (item.isGroup ? item.jid : phone(item.jid.split('@')[0]));
            const hintJid = item.isGroup ? item.jid : phone(item.jid.split('@')[0]);
            options.push({
                label: `${item.jid === cur ? '★ ' : ''}[${kindTag}] ${displayName}`,
                hint: item.name ? hintJid : kindTag,
                value: { kind: 'chat', jid: item.jid, label: displayName }
            });
        }

        options.push({
            label: '+ Escribir número de WhatsApp',
            hint: 'Ej: 59899123456',
            value: { kind: 'phone' },
            key: 'n'
        });
        options.push({
            label: '+ Escribir JID de grupo (@g.us)',
            hint: 'Ej: 120363012345678901@g.us',
            value: { kind: 'groupjid' },
            key: 'g'
        });
        if (cur) {
            options.push({
                label: 'Quitar grupo/chat destino',
                hint: 'Dejar vacío',
                value: { kind: 'clear' },
                key: 'x'
            });
        }
        options.push({ label: 'Volver', value: null, key: '0' });

        const picked = await select<PickVal>({
            header: () => [
                ...title('TikTok a .s2 › Grupo o chat destino'),
                ...para(
                    known.length
                        ? 'Elige un grupo o chat detectado por el bot, o escribe uno manualmente. También puedes escribir .tiktoks2 aqui dentro del grupo de WhatsApp.'
                        : 'Aún no hay grupos guardados en la base de datos. Conecta el bot o escribe un número/JID manualmente (o usa .tiktoks2 aqui en WhatsApp).',
                    c.dim
                )
            ],
            options,
            back: null
        });

        if (!picked) return;

        if (picked.kind === 'chat') {
            const next = loadSettings().tiktokS2;
            saveSettings({
                tiktokS2: { ...next, targetJid: picked.jid, targetLabel: picked.label, enabled: true }
            });
            return;
        }

        if (picked.kind === 'clear') {
            const next = loadSettings().tiktokS2;
            saveSettings({
                tiktokS2: { ...next, targetJid: '', targetLabel: '', enabled: false }
            });
            return;
        }

        if (picked.kind === 'phone') {
            const raw = await prompt({
                header: () => [
                    ...title('TikTok a .s2 › Número destino'),
                    ...para('Escribe el número con código de país, sin + ni espacios (ejemplo: 59899123456).', c.dim)
                ],
                label: 'Número de WhatsApp',
                maxLength: 24,
                validate: v => {
                    const digits = cleanNumber(v);
                    return digits.length >= 7 && digits.length <= 20
                        ? null
                        : 'Introduce entre 7 y 20 dígitos con código de país.';
                }
            });
            if (raw !== null) {
                const digits = cleanNumber(raw);
                const jid = `${digits}@s.whatsapp.net`;
                const next = loadSettings().tiktokS2;
                saveSettings({
                    tiktokS2: { ...next, targetJid: jid, targetLabel: phone(digits), enabled: true }
                });
            }
            return;
        }

        if (picked.kind === 'groupjid') {
            const raw = await prompt({
                header: () => [
                    ...title('TikTok a .s2 › JID de grupo'),
                    ...para('Pega el JID del grupo terminado en @g.us (puedes usar .tiktoks2 aqui en el grupo para configurarlo sin copiar el JID).', c.dim)
                ],
                label: 'JID del grupo',
                maxLength: 48,
                validate: v => (cleanTargetJid(v).endsWith('@g.us') ? null : 'Debe tener formato 120363...@g.us')
            });
            if (raw !== null) {
                const jid = cleanTargetJid(raw);
                const next = loadSettings().tiktokS2;
                saveSettings({
                    tiktokS2: { ...next, targetJid: jid, targetLabel: jid, enabled: true }
                });
            }
        }
    }

    async function tiktokS2Screen(): Promise<void> {
        type TItem = 'toggle' | 'target' | 'user' | 'source' | 'mode' | 'dm' | 'poll' | 'back';
        let index = 0;

        while (true) {
            const s = loadSettings();
            const t = s.tiktokS2;
            const targetDesc = t.targetJid
                ? (t.targetLabel ? `${t.targetLabel} (${t.targetJid})` : t.targetJid)
                : 'sin elegir';

            const choice = await select<TItem>({
                header: () => [
                    ...title('Personalizar › TikTok a .s2'),
                    ...para('Convierte videos de TikTok en stickers con audio (.s2) automáticamente y los envía al grupo o chat que elijas.', c.dim)
                ],
                options: [
                    { label: 'Automatización', hint: t.enabled ? 'activada' : 'desactivada', value: 'toggle', key: '1' },
                    { label: 'Grupo o chat destino', hint: targetDesc, value: 'target', key: '2' },
                    { label: 'Cuenta de TikTok', hint: t.username ? `@${t.username}` : 'ninguna', value: 'user', key: '3' },
                    { label: 'Detectar en cuenta', hint: TIKTOK_S2_SOURCE_NAMES[t.source], value: 'source', key: '4' },
                    { label: 'Modo de .s2', hint: TIKTOK_S2_MODE_NAMES[t.mode], value: 'mode', key: '5' },
                    { label: 'Links enviados al privado', hint: t.privateLinks ? 'activado' : 'desactivado', value: 'dm', key: '6' },
                    { label: 'Intervalo de revisión', hint: `cada ${t.pollSeconds}s`, value: 'poll', key: '7' },
                    { label: 'Volver', hint: '', value: 'back', key: '0' }
                ],
                initial: index,
                back: 'back'
            });

            const order: TItem[] = ['toggle', 'target', 'user', 'source', 'mode', 'dm', 'poll', 'back'];
            index = Math.max(0, order.indexOf(choice));
            if (choice === 'back') return;

            if (choice === 'toggle') {
                if (!t.enabled && !t.targetJid) {
                    await message(() => [
                        ...title('TikTok a .s2'),
                        ...para('Primero elige el grupo o chat destino donde el bot enviará los stickers .s2.', c.yellow)
                    ]);
                    await pickTikTokTargetScreen();
                } else {
                    saveSettings({ tiktokS2: { ...t, enabled: !t.enabled } });
                }
            } else if (choice === 'target') {
                await pickTikTokTargetScreen();
            } else if (choice === 'user') {
                const raw = await prompt({
                    header: () => [
                        ...title('TikTok a .s2 › Cuenta de TikTok'),
                        ...para('Escribe el @usuario (o enlace de perfil) de TikTok a monitorear. Déjalo vacío para no monitorear cuenta y usar solo links por privado.', c.dim)
                    ],
                    label: 'Usuario de TikTok (@usuario)',
                    initial: t.username ? `@${t.username}` : '',
                    maxLength: 120,
                    validate: v => {
                        if (!v.trim()) return null;
                        return cleanTikTokUsername(v) ? null : 'Usuario de TikTok inválido.';
                    }
                });
                if (raw !== null) {
                    const username = cleanTikTokUsername(raw);
                    saveSettings({ tiktokS2: { ...t, username } });
                }
            } else if (choice === 'source') {
                const src = await select<TikTokS2Source | null>({
                    header: () => [
                        ...title('TikTok a .s2 › Qué detectar en la cuenta'),
                        ...para('Nota: para detectar republicados o "Me gusta", esa sección debe ser pública en el perfil de TikTok.', c.dim)
                    ],
                    options: [
                        ...TIKTOK_S2_SOURCES.map((item, i) => ({
                            label: TIKTOK_S2_SOURCE_NAMES[item],
                            value: item as TikTokS2Source | null,
                            key: String(i + 1)
                        })),
                        { label: 'Volver', value: null, key: '0' }
                    ],
                    initial: Math.max(0, TIKTOK_S2_SOURCES.indexOf(t.source)),
                    preview: val => (val ? para(TIKTOK_S2_SOURCE_HINTS[val], c.dim) : []),
                    back: null
                });
                if (src) saveSettings({ tiktokS2: { ...t, source: src } });
            } else if (choice === 'mode') {
                const m = await select<TikTokS2Mode | null>({
                    header: () => [
                        ...title('TikTok a .s2 › Modo de sticker con audio'),
                        ...para('Elige con qué modo de .s2 se crearán los stickers automáticos:')
                    ],
                    options: [
                        ...TIKTOK_S2_MODES.map((item, i) => ({
                            label: TIKTOK_S2_MODE_NAMES[item],
                            value: item as TikTokS2Mode | null,
                            key: String(i + 1)
                        })),
                        { label: 'Volver', value: null, key: '0' }
                    ],
                    initial: Math.max(0, TIKTOK_S2_MODES.indexOf(t.mode)),
                    preview: val => (val ? para(TIKTOK_S2_MODE_HINTS[val], c.dim) : []),
                    back: null
                });
                if (m) saveSettings({ tiktokS2: { ...t, mode: m } });
            } else if (choice === 'dm') {
                saveSettings({ tiktokS2: { ...t, privateLinks: !t.privateLinks } });
            } else if (choice === 'poll') {
                const steps = [30, 45, 60, 120, 300];
                const curIdx = steps.indexOf(t.pollSeconds);
                const nextPoll = steps[(curIdx + 1) % steps.length];
                saveSettings({ tiktokS2: { ...t, pollSeconds: nextPoll } });
            }
        }
    }

    async function customizeScreen(): Promise<void> {
        type Item = 'style' | 'menu' | 'reactions' | 'tiktoks2' | 'name' | 'prefix' | 'coin' | 'dev' | 'owners' | 'banner' | 'logs' | 'restart' | 'reset' | 'back';
        let index = 0;

        while (true) {
            const s = loadSettings();
            const r = s.reactions;
            const tt = s.tiktokS2;
            const ttHint = tt.enabled && tt.targetJid
                ? `${tt.username ? `@${tt.username} → ` : ''}${tt.targetLabel || tt.targetJid}`
                : 'desactivado';
            const items: { label: string; hint: string; value: Item; key: string }[] = [
                { label: 'Estilo del menú', hint: MENU_THEME_NAMES[s.menuTheme], value: 'style', key: '1' },
                { label: 'Formato del menú', hint: MENU_STYLE_NAMES[s.menuStyle], value: 'menu', key: '2' },
                { label: 'Reacciones', hint: r.enabled ? `${r.events.wait || '—'} espera ${r.events.done || '—'} listo` : 'desactivadas', value: 'reactions', key: '3' },
                { label: 'TikTok a .s2', hint: ttHint, value: 'tiktoks2', key: 't' },
                { label: 'Nombre del bot', hint: s.botName, value: 'name', key: '4' },
                { label: 'Prefijo', hint: s.prefix, value: 'prefix', key: '5' },
                { label: 'Moneda', hint: s.coin, value: 'coin', key: '6' },
                { label: 'Desarrollador', hint: s.devName, value: 'dev', key: '7' },
                { label: 'Dueños', hint: s.owners.length ? s.owners.map(phone).join(', ') : 'ninguno', value: 'owners', key: '8' },
                { label: 'Banner principal', hint: s.banner, value: 'banner', key: '9' },
                { label: 'Logs de mensajes', hint: s.logMode, value: 'logs', key: 'l' },
                { label: 'Reinicio automático', hint: s.autoRestart ? 'activado' : 'desactivado', value: 'restart', key: 'a' },
                { label: 'Restablecer todo', hint: 'Valores iniciales', value: 'reset', key: 'r' },
                { label: 'Volver', hint: '', value: 'back', key: '0' }
            ];

            const choice = await select<Item>({
                header: () => [
                    ...title('Personalizar bot'),
                    ...para('Los cambios se guardan al momento y el bot los aplica sin reiniciarlo.', c.dim)
                ],
                options: items,
                initial: index,
                back: 'back'
            });
            index = Math.max(0, items.findIndex(item => item.value === choice));

            if (choice === 'back') return;

            if (choice === 'style') {
                await menuStyleScreen();
            } else if (choice === 'reactions') {
                await reactionsScreen();
            } else if (choice === 'tiktoks2') {
                await tiktokS2Screen();
            } else if (choice === 'menu') {
                const style = await select<MenuStyle | null>({
                    header: () => [
                        ...title('Personalizar › Formato del menú'),
                        ...para(`Cómo responde el bot al comando ${s.prefix}menu:`)
                    ],
                    options: [
                        ...MENU_STYLES.map((item, i) => ({
                            label: MENU_STYLE_NAMES[item],
                            value: item as MenuStyle | null,
                            key: String(i + 1)
                        })),
                        { label: 'Volver', value: null, key: '0' }
                    ],
                    initial: Math.max(0, MENU_STYLES.indexOf(s.menuStyle)),
                    preview: value => (value ? para(MENU_STYLE_HINTS[value], c.dim) : []),
                    back: null
                });
                if (style) saveSettings({ menuStyle: style });
            } else if (choice === 'name') {
                const value = await editText('Nombre del bot', 'Nuevo nombre del bot', 'Aparece en el menú, stickers y mensajes.', s.botName, 40);
                if (value) saveSettings({ botName: value });
            } else if (choice === 'prefix') {
                const value = await editText('Prefijo', 'Nuevo prefijo', 'Un solo símbolo, por ejemplo  .  !  #  /', s.prefix, 2,
                    v => (Array.from(v).length === 1 && !/[\s\w]/.test(v) ? null : 'Usa un único símbolo (no letras ni números).'));
                if (value) saveSettings({ prefix: value });
            } else if (choice === 'coin') {
                const value = await editText('Moneda', 'Nombre de la moneda', 'Se usa en los comandos de economía.', s.coin, 24);
                if (value) saveSettings({ coin: value });
            } else if (choice === 'dev') {
                const value = await editText('Desarrollador', 'Nombre del desarrollador', 'Aparece en el menú y en la información del bot.', s.devName, 40);
                if (value) saveSettings({ devName: value });
            } else if (choice === 'owners') {
                await ownersScreen();
            } else if (choice === 'banner') {
                const value = await editText('Banner principal', 'Imagen principal del bot',
                    `Ruta dentro del bot o URL. Por defecto: ${DEFAULT_BANNER}. La usan el menú (si el estilo no tiene banner propio), el perfil y la información del bot.`,
                    s.banner, 300, bannerProblem);
                if (value) saveSettings({ banner: value });
            } else if (choice === 'logs') {
                saveSettings({ logMode: LOG_MODES[(LOG_MODES.indexOf(s.logMode) + 1) % LOG_MODES.length] });
            } else if (choice === 'restart') {
                saveSettings({ autoRestart: !s.autoRestart });
            } else if (choice === 'reset') {
                const ok = await confirm(
                    () => [...title('Personalizar › Restablecer'),
                        ...para('Se restablecerán nombre, prefijo, moneda, estilo y formato del menú, banners, reacciones y logs.'),
                        ...para('Los dueños y la sesión activa se conservan.', c.dim)],
                    '¿Restablecer los valores iniciales?'
                );
                if (ok) resetSettings({ owners: s.owners, activeSession: s.activeSession });
            }
        }
    }

    // ───────────────────────── salida ─────────────────────────

    let closing = false;

    async function shutdown(code = 0): Promise<never> {
        if (!closing) {
            closing = true;
            if (isRunning()) {
                await Promise.race([stopBot(), new Promise(resolve => setTimeout(resolve, 5000))]);
            }
            killBotNow();
            restoreTerminal();
        }
        process.exit(code);
    }

    async function quitFlow(): Promise<void> {
        if (isRunning()) {
            const ok = await confirm(
                () => [...title('Salir'), ...para('El bot está encendido y se apagará al cerrar el panel.')],
                '¿Salir y detener el bot?'
            );
            if (!ok) return;
        }
        await shutdown(0);
    }

    process.on('exit', () => {
        killBotNow();
        restoreTerminal();
    });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.on(signal, () => void shutdown(0));
    }
    process.on('uncaughtException', error => {
        killBotNow();
        restoreTerminal();
        console.error('\n El panel se cerró por un error inesperado:\n', error);
        process.exit(1);
    });

    // ───────────────────────── arranque ─────────────────────────

    migrateLegacySession();

    initTerminal(key => {
        if (key.ctrl && key.name === 'c') {
            void shutdown(0);
            return true;
        }
        if (key.ctrl && key.name === 'l') {
            process.stdout.write('\u001b[2J');
            draw();
            return true;
        }
        return false;
    });

    // Atajos por argumento: `npm start -- start`, `npm start -- sesiones`, etc.
    const shortcuts: Record<string, Action> = {
        start: 'start', iniciar: 'start',
        consola: 'console', console: 'console',
        sesiones: 'sessions', sessions: 'sessions',
        eliminar: 'delete', delete: 'delete',
        actualizar: 'update', update: 'update',
        personalizar: 'customize', config: 'customize',
        datos: 'wipe', borrar: 'wipe', reset: 'wipe', wipe: 'wipe'
    };
    let next: Action | null = shortcuts[(process.argv[2] || '').toLowerCase()] ?? null;

    panelLog('Panel de Denji bot listo.');

    while (true) {
        const action: Action = next ?? await mainMenu();
        next = null;

        try {
            switch (action) {
                case 'start':
                    await startFlow();
                    break;
                case 'console':
                    await openConsole();
                    break;
                case 'sessions':
                    await sessionsScreen();
                    break;
                case 'delete':
                    await deleteSessionsScreen();
                    break;
                case 'update':
                    await updateScreen();
                    break;
                case 'customize':
                    await customizeScreen();
                    break;
                case 'wipe':
                    await wipeDataScreen();
                    break;
                case 'stop':
                    await stopBot();
                    break;
                case 'quit':
                    await quitFlow();
                    break;
            }
        } catch (error: any) {
            await message(() => [...title('Error'), ' ' + c.red(String(error?.message || error))]);
        }
    }
}
