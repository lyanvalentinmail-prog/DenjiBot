import readline from 'node:readline';
import chalk from 'chalk';

/**
 * Utilidades de terminal para el panel de Denji bot: pantalla completa sin
 * parpadeos, lectura de teclas, menús, formularios y formato de texto.
 * Pensado para pantallas estrechas (Termux).
 */

export interface Key {
    name?: string;
    sequence?: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
}

export interface Screen {
    render(): string[];
    onKey(key: Key): void;
    /** Redibujar cada N milisegundos (para relojes y datos en vivo). */
    tick?: number;
    onTick?(): void;
}

// ───────────────────────── colores ─────────────────────────

export const c = {
    accent: chalk.hex('#FF7A1A'),
    accentBold: chalk.hex('#FF7A1A').bold,
    red: chalk.hex('#E5383B'),
    green: chalk.hex('#52D273'),
    yellow: chalk.hex('#F2C14E'),
    blue: chalk.hex('#5AB0F2'),
    dim: chalk.gray,
    bold: chalk.bold,
    white: chalk.white,
    inverse: chalk.bgHex('#FF7A1A').black
};

// ───────────────────────── texto ─────────────────────────

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/y;

const WIDE_EMOJI = new Set<number>([
    0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615,
    0x2648, 0x2649, 0x264a, 0x264b, 0x264c, 0x264d, 0x264e, 0x264f, 0x2650, 0x2651, 0x2652, 0x2653,
    0x267f, 0x2693, 0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26ce, 0x26d4, 0x26ea,
    0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2705, 0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753,
    0x2754, 0x2755, 0x2757, 0x2795, 0x2796, 0x2797, 0x27b0, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55
]);

function charWidth(cp: number): number {
    if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
    if (
        (cp >= 0x300 && cp <= 0x36f) ||
        (cp >= 0x483 && cp <= 0x489) ||
        (cp >= 0x591 && cp <= 0x5c7) ||
        (cp >= 0x610 && cp <= 0x61a) ||
        (cp >= 0x64b && cp <= 0x65f) ||
        (cp >= 0x200b && cp <= 0x200f) ||
        (cp >= 0x202a && cp <= 0x202e) ||
        (cp >= 0x2060 && cp <= 0x2064) ||
        (cp >= 0xfe00 && cp <= 0xfe0f) ||
        (cp >= 0xe0100 && cp <= 0xe01ef) ||
        cp === 0xfeff
    ) return 0;
    if (
        cp >= 0x1100 && (
            cp <= 0x115f ||
            (cp >= 0x2e80 && cp <= 0xa4cf) ||
            (cp >= 0xac00 && cp <= 0xd7a3) ||
            (cp >= 0xf900 && cp <= 0xfaff) ||
            (cp >= 0xfe30 && cp <= 0xfe6f) ||
            (cp >= 0xff00 && cp <= 0xff60) ||
            (cp >= 0xffe0 && cp <= 0xffe6) ||
            (cp >= 0x1f300 && cp <= 0x1faff) ||
            (cp >= 0x20000 && cp <= 0x3fffd)
        )
    ) return 2;
    // Emojis del bloque básico que las terminales dibujan a doble ancho.
    if (cp >= 0x231a && cp <= 0x2b55 && WIDE_EMOJI.has(cp)) return 2;
    return 1;
}

/** Ancho visible de un texto (ignora los códigos de color). */
export function width(text: string): number {
    let total = 0;
    let i = 0;
    while (i < text.length) {
        if (text.charCodeAt(i) === 0x1b) {
            ANSI.lastIndex = i;
            const match = ANSI.exec(text);
            if (match) {
                i += match[0].length;
                continue;
            }
        }
        const cp = text.codePointAt(i)!;
        total += charWidth(cp);
        i += cp > 0xffff ? 2 : 1;
    }
    return total;
}

/** Recorta un texto al ancho indicado conservando los códigos de color. */
export function fit(text: string, max: number): string {
    if (max <= 0) return '';
    let total = 0;
    let i = 0;
    let hadAnsi = false;
    while (i < text.length) {
        if (text.charCodeAt(i) === 0x1b) {
            ANSI.lastIndex = i;
            const match = ANSI.exec(text);
            if (match) {
                hadAnsi = true;
                i += match[0].length;
                continue;
            }
        }
        const cp = text.codePointAt(i)!;
        const w = charWidth(cp);
        if (total + w > max) {
            return text.slice(0, i) + (hadAnsi ? '\u001b[0m' : '');
        }
        total += w;
        i += cp > 0xffff ? 2 : 1;
    }
    return text;
}

export function pad(text: string, size: number): string {
    const missing = size - width(text);
    return missing > 0 ? text + ' '.repeat(missing) : text;
}

/** Parte un texto en líneas que caben en el ancho indicado (por palabras). */
export function wrap(text: string, max: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (line && width(line) + 1 + width(word) > max) {
            lines.push(line);
            line = word;
        } else {
            line = line ? `${line} ${word}` : word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

export function fmtBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, i);
    return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function fmtNumber(value: number): string {
    return String(Math.round(value || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function fmtAgo(timestamp: number): string {
    if (!timestamp) return 'nunca';
    return `hace ${fmtDuration(Date.now() - timestamp)}`;
}

export function bar(ratio: number, size: number): string {
    const clamped = Math.max(0, Math.min(1, ratio || 0));
    const filled = Math.round(clamped * size);
    const color = clamped > 0.9 ? c.red : clamped > 0.75 ? c.yellow : c.accent;
    return color('█'.repeat(filled)) + c.dim('░'.repeat(size - filled));
}

export const cols = (): number => Math.max(20, process.stdout.columns || 80);
export const rows = (): number => Math.max(8, process.stdout.rows || 24);

export const rule = (): string => c.dim('─'.repeat(Math.min(cols() - 2, 60)));

// ───────────────────────── pantalla ─────────────────────────

let active = false;
let current: Screen | null = null;
let drawTimer: NodeJS.Timeout | null = null;
let globalKeyHandler: ((key: Key) => boolean) | null = null;

export function draw(): void {
    if (!active || !current) return;
    const width = cols();
    const height = rows();
    let lines: string[];
    try {
        lines = current.render();
    } catch (error: any) {
        lines = [c.red(` Error al dibujar la pantalla: ${error?.message || error}`)];
    }
    if (lines.length > height) lines = lines.slice(0, height);

    let out = '\u001b[H';
    for (let i = 0; i < lines.length; i++) {
        out += fit(lines[i]!, width) + '\u001b[0m\u001b[K';
        if (i < lines.length - 1) out += '\r\n';
    }
    out += '\u001b[J';
    process.stdout.write(out);
}

/** Pide un redibujado agrupando ráfagas (por ejemplo, muchos logs seguidos). */
export function scheduleDraw(): void {
    if (drawTimer) return;
    drawTimer = setTimeout(() => {
        drawTimer = null;
        draw();
    }, 60);
}

export function initTerminal(onGlobalKey: (key: Key) => boolean): void {
    if (active) return;
    active = true;
    globalKeyHandler = onGlobalKey;

    // Pantalla alternativa, cursor oculto y sin salto de línea automático.
    process.stdout.write('\u001b[?1049h\u001b[?25l\u001b[?7l\u001b[2J\u001b[H');

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on('keypress', (_: string, key: Key | undefined) => {
        const k: Key = key || {};
        if (globalKeyHandler?.(k)) return;
        try {
            current?.onKey(k);
        } catch {}
    });

    process.stdout.on('resize', () => draw());
}

export function restoreTerminal(): void {
    if (!active) return;
    active = false;
    if (drawTimer) clearTimeout(drawTimer);
    try {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
    } catch {}
    process.stdout.write('\u001b[0m\u001b[?7h\u001b[?25h\u001b[?1049l');
}

/** Muestra una pantalla y espera a que termine con un valor. */
export function show<T>(make: (done: (value: T) => void) => Screen): Promise<T> {
    return new Promise<T>(resolve => {
        let finished = false;
        let timer: NodeJS.Timeout | null = null;

        const screen = make(value => {
            if (finished) return;
            finished = true;
            if (timer) clearInterval(timer);
            if (current === screen) current = null;
            resolve(value);
        });

        current = screen;
        if (screen.tick) {
            timer = setInterval(() => {
                if (current !== screen) return;
                try {
                    screen.onTick?.();
                } catch {}
                draw();
            }, screen.tick);
        }
        draw();
    });
}

// ───────────────────────── componentes ─────────────────────────

export interface Option<T> {
    label: string;
    hint?: string;
    value: T;
    /** Tecla de atajo (un carácter). */
    key?: string;
}

export interface SelectConfig<T> {
    header: () => string[];
    options: Option<T>[] | (() => Option<T>[]);
    /** Valor devuelto al pulsar Esc / ←. */
    back: T;
    footer?: string;
    initial?: number;
    tick?: number;
    onTick?: () => void;
    /**
     * Líneas que se muestran debajo de la lista para la opción señalada (por
     * ejemplo, una vista previa). Se recortan al espacio libre de la pantalla.
     */
    preview?: (value: T) => string[];
}

export function select<T>(config: SelectConfig<T>): Promise<T> {
    return show<T>(done => {
        const getOptions = () => (typeof config.options === 'function' ? config.options() : config.options);
        let index = Math.max(0, Math.min(config.initial ?? 0, getOptions().length - 1));

        return {
            tick: config.tick,
            onTick: config.onTick,
            render() {
                const options = getOptions();
                if (index >= options.length) index = Math.max(0, options.length - 1);
                const labelSize = Math.min(24, Math.max(...options.map(o => width(o.label)), 0));
                const header = config.header();
                const lines = [...header, ''];

                // Si la lista no cabe en pantalla se muestra una ventana alrededor de la selección.
                // Con vista previa, la lista cede sitio (hasta quedarse en 5 filas).
                const total = rows() - header.length - 4;
                const room = Math.max(3, config.preview ? Math.min(total, Math.max(5, total - 6)) : total);
                let start = 0;
                if (options.length > room) {
                    start = Math.max(0, Math.min(index - Math.floor(room / 2), options.length - room));
                }
                const end = Math.min(options.length, start + room);

                for (let i = start; i < end; i++) {
                    const option = options[i]!;
                    const selected = i === index;
                    const key = option.key ? `${option.key} ` : '  ';
                    const pointer = selected ? c.accentBold(' ❯ ') : '   ';
                    const label = selected ? c.accentBold(pad(option.label, labelSize)) : c.white(pad(option.label, labelSize));
                    const hint = option.hint ? '  ' + c.dim(option.hint) : '';
                    lines.push(`${pointer}${c.dim(key)}${label}${hint}`);
                }

                if (config.preview && options[index]) {
                    const free = rows() - lines.length - 3;
                    const preview = config.preview(options[index]!.value);
                    if (preview.length && free >= 3) {
                        lines.push('');
                        if (preview.length > free) {
                            lines.push(...preview.slice(0, free - 1), ' ' + c.dim('…'));
                        } else {
                            lines.push(...preview);
                        }
                    }
                }

                const more = options.length > room ? ` (${index + 1}/${options.length})` : '';
                lines.push('', ' ' + c.dim((config.footer ?? '↑↓ mover · Enter elegir · Esc volver') + more));
                return lines;
            },
            onKey(key) {
                const options = getOptions();
                if (!options.length) return done(config.back);

                const typed = (key.sequence || '').toLowerCase();
                if (typed.length === 1 && !key.ctrl && !key.meta) {
                    const hit = options.findIndex(o => o.key && o.key.toLowerCase() === typed);
                    if (hit !== -1) {
                        index = hit;
                        return done(options[hit]!.value);
                    }
                }
                if (key.name === 'up' || key.name === 'k') {
                    index = (index - 1 + options.length) % options.length;
                    return draw();
                }
                if (key.name === 'down' || key.name === 'j' || key.name === 'tab') {
                    index = (index + 1) % options.length;
                    return draw();
                }
                if (key.name === 'return' || key.name === 'enter' || key.name === 'right') {
                    return done(options[index]!.value);
                }
                if (key.name === 'escape' || key.name === 'left') {
                    return done(config.back);
                }
            }
        };
    });
}

export interface PromptConfig {
    header: () => string[];
    label: string;
    hint?: string;
    initial?: string;
    maxLength?: number;
    /** Devuelve un mensaje de error o `null` si el valor es válido. */
    validate?: (value: string) => string | null;
}

/** Campo de texto. Devuelve `null` si se cancela con Esc. */
export function prompt(config: PromptConfig): Promise<string | null> {
    return show<string | null>(done => {
        let value = config.initial ?? '';
        let error = '';
        const max = config.maxLength ?? 200;

        return {
            render() {
                const lines = [...config.header(), ''];
                lines.push(' ' + c.bold(config.label));
                if (config.hint) lines.push(...wrap(config.hint, cols() - 2).map(line => ' ' + c.dim(line)));
                lines.push('');
                lines.push(' ' + c.accent('❯ ') + c.white(value) + c.accent('█'));
                lines.push('');
                if (error) lines.push(' ' + c.red('✖ ' + error), '');
                lines.push(' ' + c.dim('Enter confirmar · Esc cancelar'));
                return lines;
            },
            onKey(key) {
                if (key.name === 'escape') return done(null);
                if (key.name === 'return' || key.name === 'enter') {
                    const trimmed = value.trim();
                    const problem = config.validate ? config.validate(trimmed) : null;
                    if (problem) {
                        error = problem;
                        return draw();
                    }
                    return done(trimmed);
                }
                if (key.name === 'backspace') {
                    value = Array.from(value).slice(0, -1).join('');
                    error = '';
                    return draw();
                }
                if (key.ctrl && key.name === 'u') {
                    value = '';
                    return draw();
                }
                const seq = key.sequence || '';
                if (!key.ctrl && !key.meta && seq && !/[\u0000-\u001f\u007f]/.test(seq)) {
                    if (Array.from(value).length < max) value += seq;
                    error = '';
                    return draw();
                }
            }
        };
    });
}

export function confirm(header: () => string[], question: string, yesLabel = 'Sí', noLabel = 'No'): Promise<boolean> {
    return select<boolean>({
        header: () => [...header(), '', ' ' + c.bold(question)],
        options: [
            { label: noLabel, value: false, key: 'n' },
            { label: yesLabel, value: true, key: 's' }
        ],
        back: false,
        footer: '↑↓ mover · Enter elegir · S sí · N no'
    });
}

/** Muestra un mensaje y espera a que se pulse una tecla. */
export function message(lines: () => string[]): Promise<void> {
    return show<void>(done => ({
        render: () => [...lines(), '', ' ' + c.dim('Pulsa una tecla para continuar')],
        onKey: () => done()
    }));
}
