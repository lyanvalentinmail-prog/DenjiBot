import zlib from 'node:zlib';
import { clockInfo } from './clock.ts';
import type { Zone } from './clock.ts';

/*
 * El reloj como imagen PNG.
 *
 * Una imagen se ve en cualquier WhatsApp (Android, iPhone, Web, Escritorio),
 * así que acompaña a la vista HTML del chat, que no todos los teléfonos dibujan.
 *
 * Todo se dibuja aquí, píxel a píxel, sin programas externos ni tipografías del
 * sistema: funciona igual en Termux, en un VPS o en un PC. Los textos usan una
 * fuente de puntos de 5×7 incluida en este archivo.
 */

type Color = [number, number, number];

const hex = (value: string): Color => [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16)
];

const C = {
    bg: hex('#0d0f14'),
    panel: hex('#161a22'),
    border: hex('#232a36'),
    face: hex('#0f1319'),
    rim: hex('#2a3240'),
    tick: hex('#465063'),
    major: hex('#aab3c2'),
    text: hex('#f3f4f7'),
    soft: hex('#c3cad6'),
    muted: hex('#8d96a6'),
    accent: hex('#ff7a1a'),
    off: hex('#1d232e')
};

/** Lienzo RGB con formas de bordes suaves. */
class Canvas {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8Array;

    constructor(width: number, height: number, background: Color) {
        this.width = width;
        this.height = height;
        this.data = new Uint8Array(width * height * 3);
        for (let i = 0; i < this.data.length; i += 3) {
            this.data[i] = background[0];
            this.data[i + 1] = background[1];
            this.data[i + 2] = background[2];
        }
    }

    /**
     * Pinta una forma descrita por su distancia al borde (negativa = dentro).
     * La franja de un píxel alrededor del borde se mezcla con el fondo.
     */
    private paint(x0: number, y0: number, x1: number, y1: number, color: Color, distance: (x: number, y: number) => number, alpha = 1): void {
        const left = Math.max(0, Math.floor(x0 - 1));
        const top = Math.max(0, Math.floor(y0 - 1));
        const right = Math.min(this.width - 1, Math.ceil(x1 + 1));
        const bottom = Math.min(this.height - 1, Math.ceil(y1 + 1));

        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
                const cover = Math.min(1, Math.max(0, 0.5 - distance(x + 0.5, y + 0.5))) * alpha;
                if (cover <= 0) continue;
                const i = (y * this.width + x) * 3;
                this.data[i] = Math.round(this.data[i]! + (color[0] - this.data[i]!) * cover);
                this.data[i + 1] = Math.round(this.data[i + 1]! + (color[1] - this.data[i + 1]!) * cover);
                this.data[i + 2] = Math.round(this.data[i + 2]! + (color[2] - this.data[i + 2]!) * cover);
            }
        }
    }

    circle(cx: number, cy: number, radius: number, color: Color, alpha = 1): void {
        this.paint(cx - radius, cy - radius, cx + radius, cy + radius, color,
            (x, y) => Math.hypot(x - cx, y - cy) - radius, alpha);
    }

    ring(cx: number, cy: number, radius: number, width: number, color: Color): void {
        const outer = radius + width / 2;
        this.paint(cx - outer, cy - outer, cx + outer, cy + outer, color,
            (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - radius) - width / 2);
    }

    /** Segmento con extremos redondeados. */
    line(ax: number, ay: number, bx: number, by: number, width: number, color: Color, alpha = 1): void {
        const half = width / 2;
        const dx = bx - ax;
        const dy = by - ay;
        const length2 = dx * dx + dy * dy || 1;
        this.paint(Math.min(ax, bx) - half, Math.min(ay, by) - half, Math.max(ax, bx) + half, Math.max(ay, by) + half, color,
            (x, y) => {
                const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length2));
                return Math.hypot(x - ax - dx * t, y - ay - dy * t) - half;
            }, alpha);
    }

    roundRect(x: number, y: number, width: number, height: number, radius: number, color: Color): void {
        const cx = x + width / 2;
        const cy = y + height / 2;
        const hw = width / 2 - radius;
        const hh = height / 2 - radius;
        this.paint(x, y, x + width, y + height, color, (px, py) => {
            const qx = Math.abs(px - cx) - hw;
            const qy = Math.abs(py - cy) - hh;
            return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
        });
    }

    /** Rectángulo de bordes nítidos (para los puntos de la fuente). */
    block(x: number, y: number, width: number, height: number, color: Color): void {
        const x0 = Math.max(0, Math.round(x));
        const y0 = Math.max(0, Math.round(y));
        const x1 = Math.min(this.width, Math.round(x + width));
        const y1 = Math.min(this.height, Math.round(y + height));
        for (let py = y0; py < y1; py++) {
            for (let px = x0; px < x1; px++) {
                const i = (py * this.width + px) * 3;
                this.data[i] = color[0];
                this.data[i + 1] = color[1];
                this.data[i + 2] = color[2];
            }
        }
    }

    toPng(): Buffer {
        const stride = this.width * 3 + 1;
        const raw = Buffer.alloc(stride * this.height);
        for (let y = 0; y < this.height; y++) {
            // Cada fila empieza con el tipo de filtro (0 = sin filtro).
            raw.set(this.data.subarray(y * this.width * 3, (y + 1) * this.width * 3), y * stride + 1);
        }

        const header = Buffer.alloc(13);
        header.writeUInt32BE(this.width, 0);
        header.writeUInt32BE(this.height, 4);
        header[8] = 8;  // bits por canal
        header[9] = 2;  // color RGB
        return Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            chunk('IHDR', header),
            chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
            chunk('IEND', Buffer.alloc(0))
        ]);
    }
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
}

/* ------------------------------ Fuente de puntos ------------------------------ */

// Cada letra son 5 columnas de 7 puntos; en cada columna el bit 0 es el punto de arriba.
const FONT: Record<string, number[]> = {
    A: [0x7e, 0x11, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x49, 0x36], C: [0x3e, 0x41, 0x41, 0x41, 0x22],
    D: [0x7f, 0x41, 0x41, 0x22, 0x1c], E: [0x7f, 0x49, 0x49, 0x49, 0x41], F: [0x7f, 0x09, 0x09, 0x09, 0x01],
    G: [0x3e, 0x41, 0x49, 0x49, 0x7a], H: [0x7f, 0x08, 0x08, 0x08, 0x7f], I: [0x41, 0x7f, 0x41],
    J: [0x20, 0x40, 0x41, 0x3f, 0x01], K: [0x7f, 0x08, 0x14, 0x22, 0x41], L: [0x7f, 0x40, 0x40, 0x40, 0x40],
    M: [0x7f, 0x02, 0x0c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f], O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
    P: [0x7f, 0x09, 0x09, 0x09, 0x06], Q: [0x3e, 0x41, 0x51, 0x21, 0x5e], R: [0x7f, 0x09, 0x19, 0x29, 0x46],
    S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7f, 0x01, 0x01], U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
    V: [0x1f, 0x20, 0x40, 0x20, 0x1f], W: [0x3f, 0x40, 0x38, 0x40, 0x3f], X: [0x63, 0x14, 0x08, 0x14, 0x63],
    Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
    '0': [0x3e, 0x51, 0x49, 0x45, 0x3e], '1': [0x42, 0x7f, 0x40], '2': [0x42, 0x61, 0x51, 0x49, 0x46],
    '3': [0x21, 0x41, 0x45, 0x4b, 0x31], '4': [0x18, 0x14, 0x12, 0x7f, 0x10], '5': [0x27, 0x45, 0x45, 0x45, 0x39],
    '6': [0x3c, 0x4a, 0x49, 0x49, 0x30], '7': [0x01, 0x71, 0x09, 0x05, 0x03], '8': [0x36, 0x49, 0x49, 0x49, 0x36],
    '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
    ' ': [0x00, 0x00, 0x00], ':': [0x36, 0x36], '.': [0x60, 0x60], ',': [0x50, 0x30], ';': [0x56, 0x36],
    '-': [0x08, 0x08, 0x08, 0x08], '+': [0x08, 0x08, 0x3e, 0x08, 0x08], '/': [0x20, 0x10, 0x08, 0x04, 0x02],
    '(': [0x1c, 0x22, 0x41], ')': [0x41, 0x22, 0x1c], '·': [0x08], "'": [0x05, 0x03], '!': [0x5f],
    '?': [0x02, 0x01, 0x51, 0x09, 0x06], '_': [0x40, 0x40, 0x40, 0x40, 0x40], '&': [0x36, 0x49, 0x55, 0x22, 0x50],
    '#': [0x14, 0x7f, 0x14, 0x7f, 0x14], '*': [0x14, 0x08, 0x3e, 0x08, 0x14], '=': [0x14, 0x14, 0x14, 0x14],
    '%': [0x23, 0x13, 0x08, 0x64, 0x62], '@': [0x32, 0x49, 0x79, 0x41, 0x3e]
};

// Tildes: puntos (columna, fila) sobre la letra; la fila -2 es la más alta.
const MARKS: Record<string, [number, number][]> = {
    '\u0301': [[2, -1], [3, -2]],                       // aguda (á)
    '\u0300': [[2, -1], [1, -2]],                       // grave (à)
    '\u0303': [[0, -1], [1, -2], [2, -1], [3, -2], [4, -2]].map(([c, r]) => [c!, r!]) as [number, number][], // virgulilla (ñ)
    '\u0308': [[1, -2], [3, -2]],                       // diéresis (ü)
    '\u0302': [[1, -1], [2, -2], [3, -1]]               // circunflejo (ê)
};

type Glyph = { columns: number[]; marks: [number, number][] };

/** Convierte un texto a las letras que tiene la fuente (mayúsculas con sus tildes). */
function glyphs(text: string): Glyph[] {
    const out: Glyph[] = [];
    for (const char of text.toLocaleUpperCase('es').normalize('NFD')) {
        const mark = MARKS[char];
        if (mark) {
            const last = out[out.length - 1];
            if (last) last.marks.push(...mark);
            continue;
        }
        const columns = FONT[char] || (/\s/.test(char) ? FONT[' '] : undefined);
        if (columns) out.push({ columns, marks: [] });
    }
    return out;
}

const textUnits = (list: Glyph[]): number =>
    list.reduce((total, glyph) => total + glyph.columns.length + 1, 0) - (list.length ? 1 : 0);

/** Ancho en píxeles de un texto a una escala (píxeles por punto). */
function textWidth(text: string, scale: number): number {
    return textUnits(glyphs(text)) * scale;
}

/** Dibuja un texto centrado en `cx`; `y` es la parte de arriba de las letras. */
function drawText(canvas: Canvas, text: string, cx: number, y: number, scale: number, color: Color): void {
    const list = glyphs(text);
    let x = Math.round(cx - textUnits(list) * scale / 2);

    for (const glyph of list) {
        const width = glyph.columns.length;
        for (let column = 0; column < width; column++) {
            const bits = glyph.columns[column]!;
            for (let row = 0; row < 7; row++) {
                if (bits & (1 << row)) canvas.block(x + column * scale, y + row * scale, scale, scale, color);
            }
        }
        // Las tildes se centran sobre la letra (pensadas para 5 columnas).
        const shift = (width - 5) / 2;
        for (const [column, row] of glyph.marks) {
            canvas.block(x + Math.round((column + shift) * scale), y + row * scale, scale, scale, color);
        }
        x += (width + 1) * scale;
    }
}

/** La escala más grande (entre `max` y `min`) con la que el texto cabe en `width`. */
function fitScale(text: string, width: number, max: number, min: number): number {
    for (let scale = max; scale > min; scale--) {
        if (textWidth(text, scale) <= width) return scale;
    }
    return min;
}

/** Recorta un texto con "..." hasta que quepa. */
function fitText(text: string, width: number, scale: number): string {
    if (textWidth(text, scale) <= width) return text;
    let cut = Array.from(text);
    while (cut.length > 1 && textWidth(cut.join('').trimEnd() + '...', scale) > width) cut = cut.slice(0, -1);
    return cut.join('').trimEnd() + '...';
}

/* ------------------------------ Dígitos de 7 segmentos ------------------------------ */

//            a     b     c     d     e     f     g
const SEGMENTS: Record<string, string> = {
    '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
    '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abfgcd'
};

function drawDigit(canvas: Canvas, digit: string, x: number, y: number, width: number, height: number, thick: number, color: Color): void {
    const on = SEGMENTS[digit] || '';
    const l = x + thick / 2;
    const r = x + width - thick / 2;
    const t = y + thick / 2;
    const m = y + height / 2;
    const b = y + height - thick / 2;
    const gap = thick * 0.72;

    const lines: Record<string, [number, number, number, number]> = {
        a: [l + gap, t, r - gap, t],
        b: [r, t + gap, r, m - gap],
        c: [r, m + gap, r, b - gap],
        d: [l + gap, b, r - gap, b],
        e: [l, m + gap, l, b - gap],
        f: [l, t + gap, l, m - gap],
        g: [l + gap, m, r - gap, m]
    };

    for (const [name, [ax, ay, bx, by]] of Object.entries(lines)) {
        // Los segmentos apagados se dejan apenas visibles, como en un reloj digital.
        canvas.line(ax, ay, bx, by, thick, on.includes(name) ? color : C.off);
    }
}

/** Dibuja "HH:MM" o ":SS" y devuelve el ancho ocupado. */
function drawTime(canvas: Canvas, text: string, x: number, y: number, height: number, color: Color, draw = true): number {
    const width = height * 0.52;
    const thick = height * 0.115;
    const space = height * 0.2;
    const colon = height * 0.3;
    let cursor = x;

    for (const char of text) {
        if (char === ':') {
            if (draw) {
                canvas.circle(cursor + colon / 2, y + height * 0.32, thick * 0.62, color);
                canvas.circle(cursor + colon / 2, y + height * 0.68, thick * 0.62, color);
            }
            cursor += colon + space;
        } else {
            if (draw) drawDigit(canvas, char, cursor, y, width, height, thick, color);
            cursor += width + space;
        }
    }
    return cursor - space - x;
}

/* ------------------------------ El reloj ------------------------------ */

export const CLOCK_IMAGE_WIDTH = 720;
export const CLOCK_IMAGE_HEIGHT = 880;

/** Imagen PNG del reloj de una zona en un instante. */
export function clockImage(target: Zone, botName: string, now: Date = new Date()): Buffer {
    const W = CLOCK_IMAGE_WIDTH;
    const H = CLOCK_IMAGE_HEIGHT;
    const info = clockInfo(target.zone, now);
    const canvas = new Canvas(W, H, C.bg);
    const cx = W / 2;
    const inner = W - 120;

    // Tarjeta
    canvas.roundRect(22, 22, W - 44, H - 44, 40, C.border);
    canvas.roundRect(24, 24, W - 48, H - 48, 38, C.panel);

    // Cabecera: nombre del bot, lugar y zona horaria
    const brand = fitText(botName, inner, 4);
    drawText(canvas, brand, cx, 62, 4, C.accent);

    const placeScale = fitScale(target.label, inner, 7, 4);
    const place = fitText(target.label, inner, placeScale);
    // Centrado en su franja aunque el nombre largo use letras más pequeñas.
    drawText(canvas, place, cx, Math.round(150 - placeScale * 3.5), placeScale, C.text);

    const zoneLine = `${target.zone} · ${info.offset}`;
    const zoneScale = fitScale(zoneLine, inner, 3, 2);
    drawText(canvas, fitText(zoneLine, inner, zoneScale), cx, Math.round(206 - zoneScale * 3.5), zoneScale, C.muted);

    // Esfera
    const cy = 432;
    const radius = 186;
    canvas.circle(cx, cy, radius, C.face);
    canvas.ring(cx, cy, radius, 4, C.rim);

    for (let i = 0; i < 60; i++) {
        const angle = i * 6 * Math.PI / 180;
        const sin = Math.sin(angle);
        const cos = -Math.cos(angle);
        const major = i % 5 === 0;
        const from = radius - (major ? 34 : 22);
        const to = radius - 12;
        canvas.line(cx + sin * from, cy + cos * from, cx + sin * to, cy + cos * to, major ? 5 : 2.5, major ? C.major : C.tick);
    }

    for (const [label, angle] of [['12', 0], ['3', 90], ['6', 180], ['9', 270]] as [string, number][]) {
        const distance = radius - 64;
        const x = cx + Math.sin(angle * Math.PI / 180) * distance;
        const y = cy - Math.cos(angle * Math.PI / 180) * distance;
        drawText(canvas, label, x, y - 14, 4, C.soft);
    }

    const hand = (angle: number, back: number, length: number, width: number, color: Color): void => {
        const rad = angle * Math.PI / 180;
        const sin = Math.sin(rad);
        const cos = -Math.cos(rad);
        canvas.line(cx - sin * back, cy - cos * back, cx + sin * length, cy + cos * length, width, color);
    };
    hand(((info.hours % 12) + info.minutes / 60 + info.seconds / 3600) * 30, 0, radius * 0.5, 12, C.text);
    hand((info.minutes + info.seconds / 60) * 6, 0, radius * 0.74, 8, C.text);
    hand(info.seconds * 6, 30, radius * 0.82, 3.5, C.accent);
    canvas.circle(cx, cy, 13, C.face);
    canvas.circle(cx, cy, 9.5, C.accent);

    // Hora digital: HH:MM en grande y :SS más pequeño, alineados por abajo
    const bigHeight = 104;
    const smallHeight = 60;
    const seconds = `:${info.time.slice(6)}`;
    const bigWidth = drawTime(canvas, info.short, 0, 0, bigHeight, C.text, false);
    const smallWidth = drawTime(canvas, seconds, 0, 0, smallHeight, C.accent, false);
    const between = 14;
    const timeX = cx - (bigWidth + between + smallWidth) / 2;
    const timeY = 660;
    drawTime(canvas, info.short, timeX, timeY, bigHeight, C.text);
    drawTime(canvas, seconds, timeX + bigWidth + between, timeY + bigHeight - smallHeight, smallHeight, C.accent);

    // Fecha
    const dateScale = fitScale(info.date, inner, 4, 2);
    drawText(canvas, fitText(info.date, inner, dateScale), cx, Math.round(814 - dateScale * 3.5), dateScale, C.soft);

    return canvas.toPng();
}
