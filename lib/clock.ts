/*
 * Hora exacta (.hora): zonas horarias y página HTML con el reloj.
 *
 * La página es un único archivo sin recursos externos. Trae la hora ya escrita
 * (la del momento en que se generó) y, si el visor ejecuta JavaScript, pasa a
 * mostrarla en vivo con el reloj del teléfono.
 */

export type Zone = { label: string; zone: string };

// Prefijo telefónico → país y zona horaria de su capital o ciudad principal.
const CALLING_CODES: Record<string, [string, string]> = {
    '1': ['Estados Unidos', 'America/New_York'],
    '1787': ['Puerto Rico', 'America/Puerto_Rico'],
    '1939': ['Puerto Rico', 'America/Puerto_Rico'],
    '1809': ['República Dominicana', 'America/Santo_Domingo'],
    '1829': ['República Dominicana', 'America/Santo_Domingo'],
    '1849': ['República Dominicana', 'America/Santo_Domingo'],
    '7': ['Rusia', 'Europe/Moscow'],
    '20': ['Egipto', 'Africa/Cairo'],
    '27': ['Sudáfrica', 'Africa/Johannesburg'],
    '30': ['Grecia', 'Europe/Athens'],
    '31': ['Países Bajos', 'Europe/Amsterdam'],
    '32': ['Bélgica', 'Europe/Brussels'],
    '33': ['Francia', 'Europe/Paris'],
    '34': ['España', 'Europe/Madrid'],
    '39': ['Italia', 'Europe/Rome'],
    '41': ['Suiza', 'Europe/Zurich'],
    '43': ['Austria', 'Europe/Vienna'],
    '44': ['Reino Unido', 'Europe/London'],
    '45': ['Dinamarca', 'Europe/Copenhagen'],
    '46': ['Suecia', 'Europe/Stockholm'],
    '47': ['Noruega', 'Europe/Oslo'],
    '48': ['Polonia', 'Europe/Warsaw'],
    '49': ['Alemania', 'Europe/Berlin'],
    '51': ['Perú', 'America/Lima'],
    '52': ['México', 'America/Mexico_City'],
    '53': ['Cuba', 'America/Havana'],
    '54': ['Argentina', 'America/Argentina/Buenos_Aires'],
    '55': ['Brasil', 'America/Sao_Paulo'],
    '56': ['Chile', 'America/Santiago'],
    '57': ['Colombia', 'America/Bogota'],
    '58': ['Venezuela', 'America/Caracas'],
    '60': ['Malasia', 'Asia/Kuala_Lumpur'],
    '61': ['Australia', 'Australia/Sydney'],
    '62': ['Indonesia', 'Asia/Jakarta'],
    '63': ['Filipinas', 'Asia/Manila'],
    '64': ['Nueva Zelanda', 'Pacific/Auckland'],
    '65': ['Singapur', 'Asia/Singapore'],
    '66': ['Tailandia', 'Asia/Bangkok'],
    '81': ['Japón', 'Asia/Tokyo'],
    '82': ['Corea del Sur', 'Asia/Seoul'],
    '84': ['Vietnam', 'Asia/Ho_Chi_Minh'],
    '86': ['China', 'Asia/Shanghai'],
    '90': ['Turquía', 'Europe/Istanbul'],
    '91': ['India', 'Asia/Kolkata'],
    '92': ['Pakistán', 'Asia/Karachi'],
    '98': ['Irán', 'Asia/Tehran'],
    '212': ['Marruecos', 'Africa/Casablanca'],
    '234': ['Nigeria', 'Africa/Lagos'],
    '240': ['Guinea Ecuatorial', 'Africa/Malabo'],
    '254': ['Kenia', 'Africa/Nairobi'],
    '351': ['Portugal', 'Europe/Lisbon'],
    '353': ['Irlanda', 'Europe/Dublin'],
    '380': ['Ucrania', 'Europe/Kyiv'],
    '501': ['Belice', 'America/Belize'],
    '502': ['Guatemala', 'America/Guatemala'],
    '503': ['El Salvador', 'America/El_Salvador'],
    '504': ['Honduras', 'America/Tegucigalpa'],
    '505': ['Nicaragua', 'America/Managua'],
    '506': ['Costa Rica', 'America/Costa_Rica'],
    '507': ['Panamá', 'America/Panama'],
    '509': ['Haití', 'America/Port-au-Prince'],
    '591': ['Bolivia', 'America/La_Paz'],
    '593': ['Ecuador', 'America/Guayaquil'],
    '595': ['Paraguay', 'America/Asuncion'],
    '598': ['Uruguay', 'America/Montevideo'],
    '852': ['Hong Kong', 'Asia/Hong_Kong'],
    '880': ['Bangladés', 'Asia/Dhaka'],
    '886': ['Taiwán', 'Asia/Taipei'],
    '966': ['Arabia Saudita', 'Asia/Riyadh'],
    '971': ['Emiratos Árabes Unidos', 'Asia/Dubai'],
    '972': ['Israel', 'Asia/Jerusalem']
};

// Otros nombres con los que se puede pedir una zona: ciudades y formas habituales.
const ALIASES: Record<string, [string, string]> = {
    'utc': ['UTC', 'UTC'],
    'gmt': ['UTC', 'UTC'],
    'eeuu': ['Estados Unidos', 'America/New_York'],
    'ee uu': ['Estados Unidos', 'America/New_York'],
    'usa': ['Estados Unidos', 'America/New_York'],
    'nueva york': ['Nueva York', 'America/New_York'],
    'miami': ['Miami', 'America/New_York'],
    'chicago': ['Chicago', 'America/Chicago'],
    'texas': ['Texas', 'America/Chicago'],
    'los angeles': ['Los Ángeles', 'America/Los_Angeles'],
    'california': ['California', 'America/Los_Angeles'],
    'canada': ['Canadá', 'America/Toronto'],
    'cdmx': ['Ciudad de México', 'America/Mexico_City'],
    'ciudad de mexico': ['Ciudad de México', 'America/Mexico_City'],
    'tijuana': ['Tijuana', 'America/Tijuana'],
    'cancun': ['Cancún', 'America/Cancun'],
    'buenos aires': ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
    'brasilia': ['Brasilia', 'America/Sao_Paulo'],
    'sao paulo': ['São Paulo', 'America/Sao_Paulo'],
    'quito': ['Quito', 'America/Guayaquil'],
    'canarias': ['Islas Canarias', 'Atlantic/Canary'],
    'inglaterra': ['Reino Unido', 'Europe/London'],
    'londres': ['Londres', 'Europe/London'],
    'roma': ['Roma', 'Europe/Rome'],
    'moscu': ['Moscú', 'Europe/Moscow'],
    'tokio': ['Tokio', 'Asia/Tokyo'],
    'corea': ['Corea del Sur', 'Asia/Seoul'],
    'seul': ['Seúl', 'Asia/Seoul'],
    'pekin': ['Pekín', 'Asia/Shanghai'],
    'holanda': ['Países Bajos', 'Europe/Amsterdam'],
    'dubai': ['Dubái', 'Asia/Dubai']
};

/** Zonas que se muestran en la lista "Otras zonas" de la página. */
export const WORLD: Zone[] = [
    { label: 'México', zone: 'America/Mexico_City' },
    { label: 'Colombia', zone: 'America/Bogota' },
    { label: 'Perú', zone: 'America/Lima' },
    { label: 'Venezuela', zone: 'America/Caracas' },
    { label: 'Chile', zone: 'America/Santiago' },
    { label: 'Argentina', zone: 'America/Argentina/Buenos_Aires' },
    { label: 'Uruguay', zone: 'America/Montevideo' },
    { label: 'España', zone: 'Europe/Madrid' },
    { label: 'Japón', zone: 'Asia/Tokyo' }
];

const normalize = (text: string): string =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_.,]+/g, ' ').replace(/\s+/g, ' ').trim();

export function isValidZone(zone: string): boolean {
    try {
        new Intl.DateTimeFormat('es', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

/** Zona horaria a partir de un número de teléfono con prefijo internacional. */
export function zoneForNumber(number: string): Zone | null {
    const digits = String(number || '').replace(/\D/g, '');
    for (let length = 4; length >= 1; length--) {
        const match = CALLING_CODES[digits.slice(0, length)];
        if (match && digits.length > length) return { label: match[0], zone: match[1] };
    }
    return null;
}

let namedZones: Map<string, Zone> | null = null;

function zoneIndex(): Map<string, Zone> {
    if (namedZones) return namedZones;
    namedZones = new Map();

    // Zonas IANA por su nombre completo y por su ciudad ("tokyo", "bogota"...).
    const supported: string[] = (Intl as any).supportedValuesOf?.('timeZone') || [];
    for (const zone of supported) {
        const city = zone.split('/').pop()!.replace(/_/g, ' ');
        namedZones.set(normalize(zone), { label: city, zone });
        if (!namedZones.has(normalize(city))) namedZones.set(normalize(city), { label: city, zone });
    }
    for (const [label, zone] of Object.values(CALLING_CODES)) namedZones.set(normalize(label), { label, zone });
    for (const [alias, [label, zone]] of Object.entries(ALIASES)) namedZones.set(alias, { label, zone });

    return namedZones;
}

/** Busca una zona por país, ciudad o nombre IANA ("españa", "tokio", "America/Bogota"). */
export function findZone(query: string): Zone | null {
    const text = normalize(query);
    if (!text) return null;

    const known = zoneIndex().get(text);
    if (known) return known;

    const raw = query.trim();
    if (raw.includes('/') && isValidZone(raw)) {
        return { label: raw.split('/').pop()!.replace(/_/g, ' '), zone: raw };
    }
    return null;
}

/** Zona del sistema donde corre el bot (último recurso). */
export function systemZone(): Zone {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return { label: zone.split('/').pop()!.replace(/_/g, ' '), zone };
}

export type ClockInfo = {
    time: string;
    short: string;
    date: string;
    offset: string;
    hours: number;
    minutes: number;
    seconds: number;
};

/** Hora, fecha y desfase de una zona en un instante. */
export function clockInfo(zone: string, now: Date = new Date()): ClockInfo {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset'
    }).formatToParts(now);
    const get = (type: string): string => parts.find(part => part.type === type)?.value || '';

    const hours = Number(get('hour')) % 24;
    const minutes = Number(get('minute'));
    const seconds = Number(get('second'));
    const two = (value: number): string => String(value).padStart(2, '0');

    const date = new Intl.DateTimeFormat('es', {
        timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(now);

    const offset = get('timeZoneName').replace('GMT', 'UTC');

    return {
        time: `${two(hours)}:${two(minutes)}:${two(seconds)}`,
        short: `${two(hours)}:${two(minutes)}`,
        date,
        offset: offset === 'UTC' ? 'UTC+0' : offset,
        hours,
        minutes,
        seconds
    };
}

const escapeHtml = (text: string): string =>
    text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

// Texto seguro dentro de un <script>.
const json = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * Reloj de una zona como bloque HTML autocontenido (estilos, marcado y script,
 * sin recursos externos). Todo va bajo la clase `dj` para poder incrustarlo tal
 * cual en la vista HTML del chat (`lib/richhtml.ts`).
 */
export function clockFragment(target: Zone, botName: string, now: Date = new Date(), note = 'Hora del momento en que se pidió el comando.'): string {
    const info = clockInfo(target.zone, now);
    const others = WORLD.filter(item => item.zone !== target.zone).slice(0, 8);

    const hourAngle = ((info.hours % 12) + info.minutes / 60 + info.seconds / 3600) * 30;
    const minuteAngle = (info.minutes + info.seconds / 60) * 6;
    const secondAngle = info.seconds * 6;

    let ticks = '';
    for (let i = 0; i < 60; i++) {
        const major = i % 5 === 0;
        ticks += `<line x1="130" y1="${major ? 16 : 18}" x2="130" y2="${major ? 30 : 23}" class="${major ? 'tk mj' : 'tk'}" transform="rotate(${i * 6} 130 130)"/>`;
    }

    let numbers = '';
    for (let hour = 1; hour <= 12; hour++) {
        const angle = (hour * 30 - 90) * Math.PI / 180;
        const x = (130 + Math.cos(angle) * 86).toFixed(1);
        const y = (130 + Math.sin(angle) * 86 + 6).toFixed(1);
        numbers += `<text x="${x}" y="${y}" class="num${hour % 3 === 0 ? ' big' : ''}">${hour}</text>`;
    }

    const cells = others.map((item, index) => {
        const other = clockInfo(item.zone, now);
        return `<div class="w"><span class="pl">${escapeHtml(item.label)}</span><span class="tm" id="dj-w${index}">${other.short}</span></div>`;
    }).join('');

    return `<style>
html,body{margin:0;padding:0;background:transparent}
.dj,.dj *{box-sizing:border-box;margin:0;padding:0}
.dj{width:100%;max-width:420px;margin:0 auto;padding:14px 12px 12px;border-radius:18px;background:#0d0f14;color:#f3f4f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;text-align:center;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}
.dj .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.dj .brand{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#ff7a1a;text-align:left}
.dj .live{display:none;align-items:center;font-size:10px;font-weight:700;letter-spacing:.1em;color:#3ddc84;border:1px solid rgba(61,220,132,.4);border-radius:999px;padding:3px 9px;white-space:nowrap}
.dj .live i{width:6px;height:6px;border-radius:50%;background:#3ddc84;margin-right:6px;animation:dj-pulse 1.6s ease-in-out infinite}
.dj.on .live{display:flex}
@keyframes dj-pulse{50%{opacity:.25}}
.dj .panel{background:#161a22;border:1px solid #232a36;border-radius:16px;padding:16px 12px 14px}
.dj .place{font-size:20px;font-weight:700;line-height:1.2}
.dj .zone{margin-top:3px;font-size:12px;color:#8d96a6}
.dj svg{display:block;width:210px;height:210px;margin:14px auto 12px}
.dj .face{fill:#0f1319;stroke:#2a3240;stroke-width:2}
.dj .tk{stroke:#465063;stroke-width:1.5;stroke-linecap:round}
.dj .tk.mj{stroke:#aab3c2;stroke-width:2.5}
.dj .num{fill:#7f8898;font-size:13px;font-weight:600;text-anchor:middle}
.dj .num.big{fill:#f3f4f7;font-size:17px;font-weight:700}
.dj .hh,.dj .mh{stroke:#f3f4f7;stroke-linecap:round}
.dj .hh{stroke-width:6}
.dj .mh{stroke-width:4}
.dj .sh{stroke:#ff7a1a;stroke-width:2;stroke-linecap:round}
.dj .cap{fill:#ff7a1a;stroke:#0f1319;stroke-width:2}
.dj .time{font-size:46px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.dj .time small{font-size:.55em;font-weight:600;color:#ff7a1a}
.dj .date{margin-top:8px;font-size:14px;line-height:1.3;color:#c3cad6}
.dj .date:first-letter{text-transform:uppercase}
.dj .note{margin-top:10px;font-size:11px;line-height:1.4;color:#8d96a6}
.dj.on .note{display:none}
.dj .ws{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
.dj .w{display:flex;align-items:center;justify-content:space-between;min-width:0;background:#161a22;border:1px solid #232a36;border-radius:10px;padding:7px 9px;font-size:12px}
.dj .pl{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c3cad6;text-align:left}
.dj .tm{margin-left:6px;font-weight:700;font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
@media (max-width:300px){.dj .time{font-size:38px}.dj .place{font-size:18px}.dj .w{font-size:11px;padding:6px 7px}}
@media (max-width:270px){.dj svg{width:170px;height:170px}}
@media (max-width:230px){.dj .ws{grid-template-columns:1fr}}
</style>
<div class="dj" id="dj">
<div class="top"><span class="brand">${escapeHtml(botName)}</span><span class="live"><i></i>EN VIVO</span></div>
<div class="panel">
<div class="place">${escapeHtml(target.label)}</div>
<div class="zone">${escapeHtml(target.zone)} · ${info.offset}</div>
<svg viewBox="0 0 260 260" width="210" height="210" role="img" aria-label="Reloj">
<circle cx="130" cy="130" r="124" class="face"/>
${ticks}
${numbers}
<line id="dj-hh" x1="130" y1="140" x2="130" y2="72" class="hh" transform="rotate(${hourAngle.toFixed(2)} 130 130)"/>
<line id="dj-mh" x1="130" y1="144" x2="130" y2="44" class="mh" transform="rotate(${minuteAngle.toFixed(2)} 130 130)"/>
<line id="dj-sh" x1="130" y1="152" x2="130" y2="34" class="sh" transform="rotate(${secondAngle.toFixed(2)} 130 130)"/>
<circle cx="130" cy="130" r="6" class="cap"/>
</svg>
<div class="time"><span id="dj-hm">${info.short}</span><small id="dj-ss">:${info.time.slice(6)}</small></div>
<div class="date" id="dj-date">${escapeHtml(info.date)}</div>
<div class="note">${escapeHtml(note)}</div>
</div>
<div class="ws">${cells}</div>
</div>
<script>
(function () {
  var zone = ${json(target.zone)};
  var world = ${json(others.map(item => item.zone))};
  var el = function (id) { return document.getElementById('dj-' + id); };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };

  function parts(z, d) {
    var text = new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
    var p = text.split(':');
    return [Number(p[0]) % 24, Number(p[1]), Number(p[2])];
  }
  function dateText(z, d) {
    return new Intl.DateTimeFormat('es', { timeZone: z, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }
  function turn(id, angle) {
    el(id).setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 130 130)');
  }

  var last = -1;
  function tick() {
    var d = new Date();
    var t = parts(zone, d);
    var s = t[2] + d.getMilliseconds() / 1000;
    turn('sh', s * 6);
    turn('mh', (t[1] + s / 60) * 6);
    turn('hh', ((t[0] % 12) + t[1] / 60 + s / 3600) * 30);
    if (t[2] === last) return;
    last = t[2];
    el('hm').textContent = two(t[0]) + ':' + two(t[1]);
    el('ss').textContent = ':' + two(t[2]);
    el('date').textContent = dateText(zone, d);
    for (var i = 0; i < world.length; i++) {
      var w = parts(world[i], d);
      el('w' + i).textContent = two(w[0]) + ':' + two(w[1]);
    }
  }

  // Dentro del chat de WhatsApp la burbuja no conoce la altura de la página:
  // se le comunica para que no quede plegada ni cambie de tamaño sin parar.
  var sizes = [];
  function fit() {
    if (!window.AndroidBridge || sizes.length >= 12) return;
    var box = document.getElementById('dj');
    var height = Math.ceil(Math.max(box ? box.getBoundingClientRect().height : 0, document.body ? document.body.scrollHeight : 0));
    if (!height || sizes[sizes.length - 1] === height) return;
    // Si la altura va y viene entre dos valores, se deja de insistir.
    if (sizes.length > 1 && sizes[sizes.length - 2] === height) { sizes.length = 12; return; }
    sizes.push(height);
    try { window.AndroidBridge.updateSize(height); } catch (e) { sizes.length = 12; }
  }

  var timer = null;
  function start() {
    if (timer === null) { tick(); timer = setInterval(tick, 100); }
  }
  function stop() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  try {
    tick();
    document.getElementById('dj').className = 'dj on';
    start();
    // La burbuja sigue viva aunque el chat no esté a la vista: ahí el reloj se detiene.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  } catch (e) {}

  try {
    fit();
    setTimeout(fit, 150);
    setTimeout(fit, 600);
    window.addEventListener('load', fit);
    window.addEventListener('resize', function () { setTimeout(fit, 120); });
  } catch (e) {}
})();
</script>`;
}

/** Página HTML completa con el reloj, para enviarla como archivo. */
export function clockHtml(target: Zone, botName: string, now: Date = new Date()): string {
    const note = 'Hora del momento en que se pidió el comando. Abre el archivo con tu navegador (por ejemplo Chrome) para ver el reloj en vivo.';
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0d0f14">
<title>Hora exacta · ${escapeHtml(target.label)}</title>
<style>.page{min-height:100vh;background:#0d0f14;padding:10px 4px 20px}</style>
</head>
<body>
<div class="page">
${clockFragment(target, botName, now, note)}
</div>
</body>
</html>
`;
}
