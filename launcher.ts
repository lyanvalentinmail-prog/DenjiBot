/**
 * Panel de control de Denji bot (lo que abre `npm start`).
 *
 * Atajos del menú:
 *   1 Start · 2 Consola del bot · 3 Sesiones · 4 Eliminar sesiones
 *   5 Actualizar bot (git pull) · 6 Personalizar bot · 0 Salir
 *
 * Si no hay una terminal interactiva (pm2, paneles de hosting, etc.) se
 * ejecuta el bot directamente, igual que `npm run bot`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

async function runPanel(): Promise<void> {
    const {
        c, draw, scheduleDraw, initTerminal, restoreTerminal, show, select, prompt, confirm, message,
        fmtBytes, fmtNumber, fmtDuration, fmtAgo, bar, pad, rule, cols, rows, wrap
    } = await import('./lib/panel/tui.ts');
    const { bot, isRunning, startBot, stopBot, restartBot, killBotNow, panelLog } = await import('./lib/panel/bot.ts');
    const {
        ROOT, loadSettings, saveSettings, resetSettings, cleanNumber, isValidSessionName,
        DEFAULT_BANNER, LOG_MODES, MENU_THEMES, MENU_THEME_NAMES, REACTION_EVENTS, REACTION_EVENT_NAMES,
        REACTION_EVENT_HINTS, MAX_COMMAND_REACTIONS, CLOCK_VIEWS, CLOCK_VIEW_NAMES, CLOCK_VIEW_HINTS,
        cleanEmoji, cleanCommandName
    } = await import('./lib/settings.ts');
    const { sampleMenu } = await import('./lib/menustyles.ts');

    type MenuTheme = (typeof MENU_THEMES)[number];
    type ReactionEvent = (typeof REACTION_EVENTS)[number];
    type ClockView = (typeof CLOCK_VIEWS)[number];
    const { listSessions, readSession, deleteSession, migrateLegacySession } = await import('./lib/sessions.ts');
    const { collectStats } = await import('./lib/stats.ts');

    type Stats = Awaited<ReturnType<typeof collectStats>>;
    type StartOptions = NonNullable<Parameters<typeof startBot>[0]>;
    type SessionInfo = ReturnType<typeof readSession>;
    type Action = 'start' | 'console' | 'sessions' | 'delete' | 'update' | 'customize' | 'stop' | 'quit' | 'none';

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
                    { label: 'Personalizar bot', hint: 'Menú, reacciones, nombre…', value: 'customize', key: '6' }
                ];
                if (running) options.push({ label: 'Detener bot', hint: 'Apagar el bot', value: 'stop', key: '7' });
                options.push({ label: 'Salir', hint: 'Cerrar el panel', value: 'quit', key: '0' });
                return options;
            },
            back: 'none',
            footer: '↑↓ mover · Enter elegir · 0-7 atajos',
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

        if (changed.includes('package.json')) {
            const install = await confirm(
                () => [...title('Actualizar bot'), ...para('La actualización cambió las dependencias (package.json).')],
                '¿Instalar dependencias ahora? (npm install)',
                'Sí, instalar',
                'Ahora no'
            );
            if (install) {
                const sharedStorage = /^\/(sdcard|storage)\//.test(ROOT);
                const args = ['install', '--no-audit', '--no-fund', ...(sharedStorage ? ['--no-bin-links'] : [])];
                await taskScreen('Actualizar bot › npm install', async log => {
                    log(c.dim(`$ npm ${args.join(' ')}`));
                    const npm = await run('npm', args, log, 900_000);
                    log('');
                    log(npm.code === 0 ? c.green('✔ Dependencias instaladas.') : c.red('✖ npm install terminó con errores.'));
                });
            }
        }

        if (isRunning()) {
            const restart = await confirm(
                () => [...title('Actualizar bot'), ...para('El bot está encendido con la versión anterior.')],
                '¿Reiniciar el bot para aplicar la actualización?'
            );
            if (restart) await restartBot();
        }

        const panelFiles = ['launcher.ts', 'package.json', 'lib/settings.ts', 'lib/sessions.ts', 'lib/stats.ts', 'lib/bridge.ts'];
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
            const options: { label: string; hint: string; value: Choice; key: string }[] = [
                ...MENU_THEMES.map((theme, i) => ({
                    label: MENU_THEME_NAMES[theme],
                    hint: [s.menuTheme === theme ? '● en uso' : '', s.menuBanners[theme] ? 'banner propio' : ''].filter(Boolean).join(' · '),
                    value: theme as Choice,
                    key: String(i + 1)
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
                        ...MENU_THEMES.map((item, i) => ({ label: MENU_THEME_NAMES[item], hint: bannerOf(item), value: item as MenuTheme | null, key: String(i + 1) })),
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

    async function customizeScreen(): Promise<void> {
        type Item = 'style' | 'menu' | 'reactions' | 'clock' | 'name' | 'prefix' | 'coin' | 'dev' | 'owners' | 'banner' | 'logs' | 'restart' | 'reset' | 'back';
        let index = 0;

        while (true) {
            const s = loadSettings();
            const r = s.reactions;
            const items: { label: string; hint: string; value: Item; key: string }[] = [
                { label: 'Estilo del menú', hint: MENU_THEME_NAMES[s.menuTheme], value: 'style', key: '1' },
                { label: 'Formato del menú', hint: s.menuStyle === 'lista' ? 'Lista interactiva' : 'Texto clásico', value: 'menu', key: '2' },
                { label: 'Reacciones', hint: r.enabled ? `${r.events.wait || '—'} espera ${r.events.done || '—'} listo` : 'desactivadas', value: 'reactions', key: '3' },
                { label: 'Nombre del bot', hint: s.botName, value: 'name', key: '4' },
                { label: 'Prefijo', hint: s.prefix, value: 'prefix', key: '5' },
                { label: 'Moneda', hint: s.coin, value: 'coin', key: '6' },
                { label: 'Desarrollador', hint: s.devName, value: 'dev', key: '7' },
                { label: 'Dueños', hint: s.owners.length ? s.owners.map(phone).join(', ') : 'ninguno', value: 'owners', key: '8' },
                { label: 'Banner principal', hint: s.banner, value: 'banner', key: '9' },
                { label: 'Reloj (.hora)', hint: CLOCK_VIEW_NAMES[s.clockView], value: 'clock', key: 'h' },
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
            } else if (choice === 'menu') {
                const style = await select<'lista' | 'texto' | null>({
                    header: () => [
                        ...title('Personalizar › Formato del menú'),
                        ...para(`Cómo responde el bot al comando ${s.prefix}menu:`)
                    ],
                    options: [
                        { label: 'Lista interactiva', hint: 'Botón de categorías', value: 'lista', key: '1' },
                        { label: 'Texto clásico', hint: 'Todo en un mensaje', value: 'texto', key: '2' },
                        { label: 'Volver', value: null, key: '0' }
                    ],
                    initial: s.menuStyle === 'lista' ? 0 : 1,
                    back: null
                });
                if (style) saveSettings({ menuStyle: style });
            } else if (choice === 'clock') {
                const view = await select<ClockView | null>({
                    header: () => [
                        ...title('Personalizar › Reloj'),
                        ...para(`Qué envía el bot con el comando ${s.prefix}hora:`),
                        '',
                        ...para('El reloj en vivo solo lo dibuja la aplicación de WhatsApp del teléfono, y no en todas las cuentas. En WhatsApp Web y Escritorio no aparece.', c.dim)
                    ],
                    options: [
                        ...CLOCK_VIEWS.map((value, i) => ({ label: CLOCK_VIEW_NAMES[value], value: value as ClockView | null, key: String(i + 1) })),
                        { label: 'Volver', value: null, key: '0' }
                    ],
                    initial: Math.max(0, CLOCK_VIEWS.indexOf(s.clockView)),
                    preview: value => (value ? para(CLOCK_VIEW_HINTS[value], c.dim) : []),
                    back: null
                });
                if (view) saveSettings({ clockView: view });
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
                        ...para('Se restablecerán nombre, prefijo, moneda, estilo y formato del menú, banners, reacciones, reloj y logs.'),
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
        personalizar: 'customize', config: 'customize'
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
