import { UserJid } from '#simple';
import { saveDB, kvGet, kvSet } from '#db';
import config from '#config';

/*
 * RPG del bot (categoría `rpg`).
 *
 * Cada persona tiene un personaje por chat, igual que las monedas de la
 * economía: lo que se gana aquí se suma a las mismas monedas que usa `.bal`.
 * El personaje se guarda en la columna `rpg` de `chat_users`.
 *
 * Este archivo reúne los datos (objetos, recetas, monstruos, oficios) y las
 * reglas (experiencia, combate, botín, misiones). Los comandos de
 * `commands/rpg/` solo leen los argumentos y escriben la respuesta.
 */

// ───────────────────────── objetos ─────────────────────────

export type ItemType =
    | 'pez' | 'mineral' | 'material' | 'botin' | 'comida' | 'pocion'
    | 'herramienta' | 'arma' | 'armadura' | 'cofre';

export type Item = {
    id: string;
    name: string;
    emoji: string;
    type: ItemType;
    /** Monedas que se reciben al venderlo. */
    sell: number;
    /** Precio en la tienda (si se vende ahí). */
    buy?: number;
    heal?: number;
    atk?: number;
    def?: number;
    hp?: number;
    note?: string;
};

const item = (id: string, emoji: string, name: string, type: ItemType, sell: number, extra: Partial<Item> = {}): Item =>
    ({ id, emoji, name, type, sell, ...extra });

export const ITEMS: Record<string, Item> = Object.fromEntries([
    // Pesca (comando `.lanzar` y el juego Fish).
    item('bota', '🥾', 'Bota vieja', 'pez', 100),
    item('sardina', '🐟', 'Sardina', 'pez', 500),
    item('mojarra', '🐠', 'Mojarra', 'pez', 1200),
    item('bagre', '🐡', 'Bagre', 'pez', 2500),
    item('trucha', '🎏', 'Trucha', 'pez', 4000),
    item('salmon', '🍣', 'Salmón', 'pez', 7000),
    item('anguila', '🐍', 'Anguila', 'pez', 12000),
    item('dorado', '👑', 'Dorado', 'pez', 25000),
    item('tiburon', '🦈', 'Tiburón', 'pez', 60000),

    item('piedra', '🪨', 'Piedra', 'mineral', 300),
    item('carbon', '⚫', 'Carbón', 'mineral', 900),
    item('hierro', '🔩', 'Hierro', 'mineral', 2200),
    item('oro', '🥇', 'Oro', 'mineral', 6500),
    item('diamante', '💎', 'Diamante', 'mineral', 20000),
    item('esmeralda', '❇️', 'Esmeralda', 'mineral', 35000),

    item('madera', '🪵', 'Madera', 'material', 400),
    item('cuero', '🟫', 'Cuero', 'material', 1600),
    item('pluma', '🪶', 'Pluma', 'material', 600),

    item('gel', '🫧', 'Gel de slime', 'botin', 500),
    item('hueso', '🦴', 'Hueso', 'botin', 800),
    item('colmillo', '🦷', 'Colmillo', 'botin', 4000),
    item('esencia', '✨', 'Esencia mágica', 'botin', 9000),
    item('escama', '🐲', 'Escama de dragón', 'botin', 40000),

    item('manzana', '🍎', 'Manzana', 'comida', 300, { heal: 15 }),
    item('pan', '🍞', 'Pan', 'comida', 500, { heal: 25, buy: 1500 }),
    item('carne', '🍖', 'Carne cruda', 'comida', 900, { heal: 10, note: 'cocínala para que cure más' }),
    item('filete', '🥩', 'Filete asado', 'comida', 1500, { heal: 45 }),
    item('pescado_asado', '🍢', 'Pescado asado', 'comida', 1200, { heal: 40 }),

    item('pocion', '🧪', 'Poción', 'pocion', 2000, { heal: 70, buy: 6000 }),
    item('superpocion', '💖', 'Superpoción', 'pocion', 7000, { heal: 99999, buy: 20000, note: 'cura toda la vida' }),

    item('pico', '⛏️', 'Pico', 'herramienta', 5000, { buy: 15000, note: 'encuentra hierro, oro y gemas al minar' }),
    item('hacha', '🪓', 'Hacha', 'herramienta', 4000, { buy: 12000, note: 'el doble de madera al talar' }),
    item('cana', '🎣', 'Caña de pescar', 'herramienta', 3500, { buy: 10000, note: 'peces más valiosos con lanzar' }),
    item('arco', '🏹', 'Arco', 'herramienta', 6000, { buy: 18000, note: 'más botín y menos heridas al cazar' }),

    item('espada_madera', '🗡️', 'Espada de madera', 'arma', 2500, { atk: 5, buy: 8000 }),
    item('espada_hierro', '⚔️', 'Espada de hierro', 'arma', 20000, { atk: 14, buy: 70000 }),
    item('espada_oro', '🔱', 'Espada de oro', 'arma', 45000, { atk: 24 }),
    item('espada_diamante', '💠', 'Espada de diamante', 'arma', 110000, { atk: 38 }),
    item('matadragones', '🐉', 'Matadragones', 'arma', 250000, { atk: 60 }),

    item('armadura_cuero', '🦺', 'Armadura de cuero', 'armadura', 8000, { def: 4, hp: 20, buy: 25000 }),
    item('armadura_hierro', '🛡️', 'Armadura de hierro', 'armadura', 25000, { def: 10, hp: 50, buy: 90000 }),
    item('armadura_diamante', '🔷', 'Armadura de diamante', 'armadura', 160000, { def: 20, hp: 100 }),
    item('armadura_dragon', '🧥', 'Armadura de dragón', 'armadura', 300000, { def: 32, hp: 160 }),

    item('cofre', '🎁', 'Cofre', 'cofre', 3000),
    item('cofre_raro', '🧰', 'Cofre raro', 'cofre', 15000)
].map(entry => [entry.id, entry]));

export const TYPE_LABELS: Record<ItemType, string> = {
    arma: '⚔️ Armas',
    armadura: '🛡️ Armaduras',
    herramienta: '🧰 Herramientas',
    pocion: '🧪 Pociones',
    comida: '🍞 Comida',
    pez: '🎣 Pesca',
    mineral: '⛏️ Minerales',
    material: '🪵 Materiales',
    botin: '🦴 Botín',
    cofre: '🎁 Cofres'
};

/** Grupos que acepta `.vender` (`.vender peces`, `.vender todo`...). */
export const SELL_GROUPS: Record<string, ItemType[]> = {
    todo: ['pez', 'mineral', 'material', 'botin'],
    all: ['pez', 'mineral', 'material', 'botin'],
    peces: ['pez'],
    pesca: ['pez'],
    minerales: ['mineral'],
    materiales: ['material'],
    botin: ['botin']
};

export const RECIPES: Record<string, Record<string, number>> = {
    pico: { hierro: 3, madera: 2 },
    hacha: { hierro: 2, madera: 2 },
    cana: { madera: 3, pluma: 1 },
    arco: { madera: 3, pluma: 2, cuero: 1 },
    pocion: { gel: 3, manzana: 1 },
    superpocion: { pocion: 2, esencia: 1 },
    espada_madera: { madera: 4 },
    espada_hierro: { hierro: 5, madera: 2 },
    espada_oro: { oro: 6, madera: 2 },
    espada_diamante: { diamante: 5, madera: 2, esencia: 1 },
    matadragones: { escama: 3, diamante: 4, esencia: 2 },
    armadura_cuero: { cuero: 6 },
    armadura_hierro: { hierro: 8, cuero: 2 },
    armadura_diamante: { diamante: 8, esencia: 2 },
    armadura_dragon: { escama: 4, diamante: 4, esencia: 3 }
};

/** Qué se obtiene al cocinar cada ingrediente. */
export const cookResult = (id: string): string | null => {
    if (id === 'carne') return 'filete';
    if (ITEMS[id]?.type === 'pez' && id !== 'bota') return 'pescado_asado';
    return null;
};

// Peces: `weight` es lo común que es y `speed` lo difícil que es atraparlo en
// el juego HTML (cuanto más alto, menos tiempo hay para tocar).
export const FISH: { id: string; weight: number; speed: number }[] = [
    { id: 'bota', weight: 8, speed: 0.8 },
    { id: 'sardina', weight: 30, speed: 0.9 },
    { id: 'mojarra', weight: 22, speed: 1 },
    { id: 'bagre', weight: 15, speed: 1.1 },
    { id: 'trucha', weight: 11, speed: 1.25 },
    { id: 'salmon', weight: 7, speed: 1.4 },
    { id: 'anguila', weight: 4, speed: 1.6 },
    { id: 'dorado', weight: 2.2, speed: 1.85 },
    { id: 'tiburon', weight: 0.8, speed: 2.1 }
];

// ───────────────────────── oficios ─────────────────────────

export type Job = { id: string; name: string; emoji: string; perk: string; phrases: string[] };

export const JOBS: Job[] = [
    { id: 'granjero', name: 'Granjero', emoji: '🌾', perk: 'la comida te cura un 50% más', phrases: ['Cosechaste trigo todo el día', 'Ordeñaste las vacas del pueblo', 'Vendiste verduras en el mercado'] },
    { id: 'minero', name: 'Minero', emoji: '⛏️', perk: 'un mineral extra cada vez que minas', phrases: ['Picaste piedra en la cantera', 'Apuntalaste un túnel de la mina', 'Encontraste una veta y te dieron comisión'] },
    { id: 'pescador', name: 'Pescador', emoji: '🎣', perk: 'vendes los peces un 25% más caros', phrases: ['Remendaste redes en el muelle', 'Llevaste la pesca del día al mercado', 'Guiaste un bote por el río'] },
    { id: 'lenador', name: 'Leñador', emoji: '🪓', perk: 'el doble de madera al talar', phrases: ['Cortaste leña para el invierno', 'Despejaste un camino del bosque', 'Repartiste troncos a la aldea'] },
    { id: 'cazador', name: 'Cazador', emoji: '🏹', perk: 'una pieza extra cada vez que cazas', phrases: ['Rastreaste un jabalí para el posadero', 'Vendiste pieles en la feria', 'Espantaste lobos del rebaño'] },
    { id: 'herrero', name: 'Herrero', emoji: '⚒️', perk: 'mejorar tu equipo cuesta un 25% menos', phrases: ['Forjaste herraduras para la caravana', 'Afilaste las espadas de la guardia', 'Reparaste una armadura abollada'] },
    { id: 'mercader', name: 'Mercader', emoji: '💰', perk: 'vendes todo un 10% más caro', phrases: ['Regateaste en el bazar', 'Llevaste especias a la ciudad vecina', 'Cerraste un buen trato con un noble'] },
    { id: 'guardia', name: 'Guardia', emoji: '🛡️', perk: '+5 de defensa', phrases: ['Hiciste la ronda nocturna', 'Escoltaste a un mercader', 'Atrapaste a un carterista'] },
    { id: 'alquimista', name: 'Alquimista', emoji: '⚗️', perk: 'las pociones te curan un 50% más', phrases: ['Destilaste pociones para el boticario', 'Clasificaste hierbas raras', 'Vendiste un elixir a un aventurero'] }
];

export const jobOf = (p: Player): Job | null => JOBS.find(job => job.id === p.job) || null;

// ───────────────────────── personaje ─────────────────────────

export type Player = {
    lvl: number;
    xp: number;
    hp: number;
    str: number;
    job: string;
    inv: Record<string, number>;
    weapon: string;
    armor: string;
    /** Nivel de mejora de cada arma o armadura (se conserva al cambiar de equipo). */
    up: Record<string, number>;
    cd: Record<string, number>;
    kills: number;
    deaths: number;
    best: number;
    wins: number;
    run: { floor: number; coins: number; loot: Record<string, number> } | null;
    q: { day: string; c: Record<string, number>; done: string[]; bonus: boolean };
};

const num = (value: any, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Deja el personaje con todos sus campos (sirve también para los recién creados). */
export function normalizePlayer(raw: any): Player {
    const p = (raw && typeof raw === 'object' ? raw : {}) as Player;
    p.lvl = Math.max(1, Math.floor(num(p.lvl, 1)));
    p.xp = Math.max(0, Math.floor(num(p.xp)));
    p.str = Math.max(0, Math.floor(num(p.str)));
    p.job = typeof p.job === 'string' ? p.job : '';
    p.inv = p.inv && typeof p.inv === 'object' ? p.inv : {};
    p.weapon = ITEMS[p.weapon]?.type === 'arma' ? p.weapon : '';
    p.armor = ITEMS[p.armor]?.type === 'armadura' ? p.armor : '';
    p.up = p.up && typeof p.up === 'object' ? p.up : {};
    p.cd = p.cd && typeof p.cd === 'object' ? p.cd : {};
    p.kills = num(p.kills);
    p.deaths = num(p.deaths);
    p.best = num(p.best);
    p.wins = num(p.wins);
    p.run = p.run && typeof p.run === 'object' ? p.run : null;
    p.q = p.q && typeof p.q === 'object' ? p.q : { day: '', c: {}, done: [], bonus: false };
    p.hp = Math.min(maxHp(p), Math.max(0, Math.floor(num(p.hp, maxHp(p)))));
    return p;
}

export const MAX_UPGRADE = 10;

/** Nivel de mejora (+0 a +10) de un arma o armadura de esta persona. */
export const upOf = (p: Player, id: string): number => (id ? Math.min(MAX_UPGRADE, Math.max(0, Math.floor(num(p.up?.[id])))) : 0);

export const maxHp = (p: Player): number => 100 + 15 * (p.lvl - 1) + (ITEMS[p.armor]?.hp || 0) + 5 * upOf(p, p.armor);
export const attackOf = (p: Player): number => 10 + 2 * p.lvl + p.str + (ITEMS[p.weapon]?.atk || 0) + 2 * upOf(p, p.weapon);
export const defenseOf = (p: Player): number =>
    2 + p.lvl + (ITEMS[p.armor]?.def || 0) + 2 * upOf(p, p.armor) + (p.job === 'guardia' ? 5 : 0);
export const xpNeeded = (lvl: number): number => Math.round(80 * Math.pow(lvl, 1.6));

/** Suma experiencia. Devuelve cuántos niveles subió (al subir se cura del todo). */
export function addXp(p: Player, amount: number): number {
    p.xp += Math.max(0, Math.round(amount));
    let ups = 0;
    while (p.xp >= xpNeeded(p.lvl) && p.lvl < 200) {
        p.xp -= xpNeeded(p.lvl);
        p.lvl++;
        ups++;
    }
    if (ups) p.hp = maxHp(p);
    return ups;
}

export const levelUpText = (p: Player, ups: number): string =>
    ups ? `\n\n🎉 *¡Subiste al nivel ${p.lvl}!* Tu vida se recuperó por completo.` : '';

// ───────────────────────── inventario ─────────────────────────

export const count = (p: Player, id: string): number => Math.max(0, Math.floor(num(p.inv[id])));

export function addItem(p: Player, id: string, amount = 1): void {
    if (!ITEMS[id] || amount <= 0) return;
    p.inv[id] = count(p, id) + Math.floor(amount);
}

export function takeItem(p: Player, id: string, amount = 1): boolean {
    const have = count(p, id);
    if (amount <= 0 || have < amount) return false;
    if (have === amount) {
        delete p.inv[id];
        // Sin el objeto, su mejora ya no existe.
        if (p.up) delete p.up[id];
    } else {
        p.inv[id] = have - amount;
    }
    return true;
}

export const label = (id: string, amount?: number): string => {
    const it = ITEMS[id];
    if (!it) return id;
    return amount == null ? `${it.emoji} ${it.name}` : `${it.emoji} ${it.name} ×${amount}`;
};

export const lootText = (loot: Record<string, number>): string =>
    Object.entries(loot).filter(([, n]) => n > 0).map(([id, n]) => label(id, n)).join(', ');

const plain = (text: string): string =>
    String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Busca un objeto por su nombre o identificador, sin importar acentos, espacios
 * ni mayúsculas ("espada de hierro", "espadahierro", "salmon"). Si el texto
 * coincide con varios devuelve la lista para que la persona elija.
 */
export function findItem(query: string, pool: Item[] = Object.values(ITEMS)): { item: Item | null; options: Item[] } {
    const q = plain(query);
    if (!q) return { item: null, options: [] };

    const keys = (it: Item): string[] => [plain(it.id), plain(it.name), plain(it.name).replace(/^(.*?)de(.+)$/, '$1$2')];
    const exact = pool.filter(it => keys(it).includes(q));
    if (exact.length) return { item: exact[0], options: exact };

    // "peces" → "pez", "manzanas" → "manzana".
    const singular = q.replace(/(es|s)$/, '');
    const starts = pool.filter(it => keys(it).some(key => key.startsWith(q) || (singular.length > 2 && key.startsWith(singular))));
    if (starts.length === 1) return { item: starts[0], options: starts };
    if (starts.length > 1) return { item: null, options: starts };

    const inside = pool.filter(it => keys(it).some(key => key.includes(q)));
    return { item: inside.length === 1 ? inside[0] : null, options: inside };
}

/** Separa "espada de hierro 3" o "sardina todo" en el nombre y la cantidad. */
export function parseItemArgs(args: string[]): { query: string; amount: number | 'all' } {
    const words = args.filter(Boolean).filter(word => !/^@/.test(word));
    let amount: number | 'all' = 1;
    const last = String(words[words.length - 1] || '').toLowerCase();
    if (words.length > 1 && /^(todo|todos|todas|all|max)$/.test(last)) {
        amount = 'all';
        words.pop();
    } else if (words.length > 1 && /^x?\d{1,6}$/.test(last)) {
        amount = Math.max(1, parseInt(last.replace('x', ''), 10));
        words.pop();
    } else if (words.length > 1 && /^x?\d{1,6}$/i.test(words[0])) {
        amount = Math.max(1, parseInt(words[0].toLowerCase().replace('x', ''), 10));
        words.shift();
    }
    return { query: words.join(' '), amount };
}

/** Precio de venta según el oficio de quien vende. */
export function sellPrice(p: Player, id: string): number {
    const it = ITEMS[id];
    if (!it) return 0;
    let factor = 1;
    if (p.job === 'mercader') factor += 0.1;
    if (p.job === 'pescador' && it.type === 'pez') factor += 0.25;
    return Math.round(it.sell * factor);
}

/** Cuánto cura un objeto a esta persona. */
export function healAmount(p: Player, id: string): number {
    const it = ITEMS[id];
    if (!it?.heal) return 0;
    let factor = 1;
    if (p.job === 'granjero' && it.type === 'comida') factor = 1.5;
    if (p.job === 'alquimista' && it.type === 'pocion') factor = 1.5;
    return Math.round(it.heal * factor);
}

// ───────────────────────── azar y formato ─────────────────────────

export const rand = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
export const chance = (probability: number): boolean => Math.random() < probability;
export const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export function weighted<T extends { weight: number }>(list: T[]): T {
    let roll = Math.random() * list.reduce((sum, entry) => sum + entry.weight, 0);
    for (const entry of list) {
        roll -= entry.weight;
        if (roll <= 0) return entry;
    }
    return list[list.length - 1];
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
export const coinName = (): string => (config as any)?.coin || '¥enes';
export const money = (n: number): string => `*${fmt(n)} ${coinName()}*`;

export function timeLeft(ms: number): string {
    const total = Math.max(1, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
}

export const bar = (value: number, max: number, size = 10): string => {
    const filled = Math.max(0, Math.min(size, Math.round((value / Math.max(1, max)) * size)));
    return '▰'.repeat(filled) + '▱'.repeat(size - filled);
};

// ───────────────────────── esperas ─────────────────────────

export const COOLDOWNS: Record<string, { ms: number; name: string }> = {
    trabajar: { ms: 3 * 60_000, name: 'Trabajar' },
    crimen: { ms: 5 * 60_000, name: 'Crimen' },
    minar: { ms: 3 * 60_000, name: 'Minar' },
    talar: { ms: 3 * 60_000, name: 'Talar' },
    cazar: { ms: 4 * 60_000, name: 'Cazar' },
    lanzar: { ms: 2 * 60_000, name: 'Lanzar la caña' },
    aventura: { ms: 4 * 60_000, name: 'Aventura' },
    mazmorra: { ms: 5 * 60_000, name: 'Mazmorra' },
    jefe: { ms: 90_000, name: 'Atacar al jefe' },
    descansar: { ms: 5 * 60_000, name: 'Descansar' },
    entrenar: { ms: 10 * 60_000, name: 'Entrenar' },
    duelo: { ms: 2 * 60_000, name: 'Duelo' },
    oficio: { ms: 12 * 3600_000, name: 'Cambiar de oficio' }
};

/** Milisegundos que faltan para volver a usar algo (0 si ya se puede). */
export const waitFor = (p: Player, key: string): number =>
    Math.max(0, num(p.cd[key]) + (COOLDOWNS[key]?.ms || 0) - Date.now());

export const startCooldown = (p: Player, key: string): void => {
    p.cd[key] = Date.now();
};

// ───────────────────────── combate ─────────────────────────

export type Monster = { name: string; hp: number; atk: number; def: number; boss?: boolean };

const MONSTERS = ['🟢 Slime', '🐀 Rata gigante', '🦇 Murciélago', '👺 Goblin', '💀 Esqueleto', '🕷️ Araña gigante', '🐺 Lobo', '👹 Orco', '🧟 Zombi', '🧙 Hechicero oscuro', '🗿 Gólem', '😈 Demonio'];
const BOSSES = ['🐂 Minotauro', '🐍 Hidra', '☠️ Liche', '🐉 Dragón'];

/** Monstruo del piso `floor` de la mazmorra (cada 5 pisos hay un guardián). */
export function monsterFor(floor: number): Monster {
    const boss = floor % 5 === 0;
    const name = boss
        ? BOSSES[Math.min(BOSSES.length - 1, floor / 5 - 1)]
        : MONSTERS[Math.min(MONSTERS.length - 1, Math.floor((floor - 1) * 0.8) + rand(0, 1))];
    const scale = boss ? 1.8 : 1;
    return {
        name,
        boss,
        hp: Math.round((30 + 18 * floor) * scale),
        atk: Math.round((5 + 2.6 * floor) * (boss ? 1.25 : 1)),
        def: Math.round(1 + 1.1 * floor)
    };
}

const strike = (atk: number, def: number): { dmg: number; crit: boolean } => {
    const crit = chance(0.12);
    const base = atk * (0.85 + Math.random() * 0.3) - def * 0.5;
    return { dmg: Math.max(1, Math.round(base * (crit ? 1.7 : 1))), crit };
};

export type FightResult = { win: boolean; rounds: number; dealt: number; taken: number; crits: number };

/** Pelea automática por turnos; el personaje golpea primero. Modifica `p.hp`. */
export function fight(p: Player, monster: Monster): FightResult {
    const atk = attackOf(p);
    const def = defenseOf(p);
    let mhp = monster.hp;
    const result: FightResult = { win: false, rounds: 0, dealt: 0, taken: 0, crits: 0 };

    while (p.hp > 0 && mhp > 0 && result.rounds < 200) {
        result.rounds++;
        const mine = strike(atk, monster.def);
        mhp -= mine.dmg;
        result.dealt += mine.dmg;
        if (mine.crit) result.crits++;
        if (mhp <= 0) break;

        const theirs = strike(monster.atk, def);
        p.hp = Math.max(0, p.hp - theirs.dmg);
        result.taken += theirs.dmg;
    }

    result.win = mhp <= 0 && p.hp > 0;
    return result;
}

/** Botín de un monstruo de la mazmorra. */
export function monsterLoot(floor: number, boss: boolean): { coins: number; loot: Record<string, number> } {
    const loot: Record<string, number> = {};
    const give = (id: string, n = 1) => { loot[id] = (loot[id] || 0) + n; };

    if (chance(0.55)) give(pick(['gel', 'hueso']), rand(1, 2));
    if (chance(0.12 + floor * 0.02)) give('colmillo');
    if (floor >= 4 && chance(0.05 + floor * 0.012)) give('esencia');
    if (chance(0.15)) give('pocion');
    if (boss) {
        give(floor >= 15 ? 'cofre_raro' : 'cofre');
        if (floor >= 10 && chance(0.25 + (floor - 10) * 0.03)) give('escama');
        if (floor >= 20) give('escama');
    }

    const coins = Math.round((1200 + 900 * floor) * (boss ? 2.5 : 1) * (0.8 + Math.random() * 0.4));
    return { coins, loot };
}

/** Lo que sale de un cofre. */
export function openChest(id: string): { coins: number; loot: Record<string, number> } {
    const rare = id === 'cofre_raro';
    const loot: Record<string, number> = {};
    const give = (key: string, n = 1) => { loot[key] = (loot[key] || 0) + n; };

    const table = rare
        ? [['diamante', 1, 3], ['oro', 2, 5], ['esencia', 1, 2], ['superpocion', 1, 2], ['pocion', 2, 4], ['esmeralda', 1, 2], ['escama', 1, 1]]
        : [['hierro', 1, 4], ['carbon', 2, 5], ['madera', 2, 6], ['pocion', 1, 2], ['pan', 1, 3], ['oro', 1, 2], ['cuero', 1, 3]];

    for (let i = 0; i < (rare ? 3 : 2); i++) {
        const [key, min, max] = pick(table) as [string, number, number];
        give(key, rand(min, max));
    }
    return { coins: rare ? rand(30000, 80000) : rand(5000, 18000), loot };
}

// ───────────────────────── misiones del día ─────────────────────────

export type Quest = { id: string; text: string; goal: number; coins: number; xp: number };

const QUEST_POOL: Quest[] = [
    { id: 'work', text: 'Trabaja {n} veces', goal: 3, coins: 9000, xp: 60 },
    { id: 'mine', text: 'Mina {n} veces', goal: 3, coins: 10000, xp: 60 },
    { id: 'chop', text: 'Tala {n} veces', goal: 3, coins: 8000, xp: 50 },
    { id: 'hunt', text: 'Sal a cazar {n} veces', goal: 2, coins: 9000, xp: 60 },
    { id: 'fish', text: 'Pesca {n} peces', goal: 5, coins: 12000, xp: 70 },
    { id: 'kills', text: 'Derrota {n} monstruos', goal: 5, coins: 14000, xp: 90 },
    { id: 'sell', text: 'Vende objetos por {n} monedas', goal: 20000, coins: 8000, xp: 50 },
    { id: 'crime', text: 'Comete {n} crímenes', goal: 2, coins: 9000, xp: 50 },
    { id: 'adventure', text: 'Ve de aventura {n} veces', goal: 2, coins: 10000, xp: 70 },
    { id: 'craft', text: 'Forja o cocina {n} objetos', goal: 2, coins: 9000, xp: 60 },
    { id: 'games', text: 'Guarda {n} partida de un juego', goal: 1, coins: 8000, xp: 50 }
];

export const today = (): string => new Date().toISOString().slice(0, 10);

function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Las tres misiones de hoy de una persona (cambian cada día). */
export function dailyQuests(p: Player, jid: string): Quest[] {
    const day = today();
    if (p.q.day !== day) p.q = { day, c: {}, done: [], bonus: false };

    const pool = [...QUEST_POOL];
    let seed = hash(`${day}|${jid}`);
    const chosen: Quest[] = [];
    while (chosen.length < 3 && pool.length) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        chosen.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return chosen;
}

/** Anota progreso para las misiones del día. */
export function track(p: Player, id: string, amount = 1): void {
    const day = today();
    if (p.q.day !== day) p.q = { day, c: {}, done: [], bonus: false };
    p.q.c[id] = num(p.q.c[id]) + amount;
}

// ───────────────────────── acceso a los datos ─────────────────────────

export type ChatUser = { coins: number; bank: number; rpg: Player; [key: string]: any };

/** Datos de una persona en un chat, con su personaje listo para usar. */
export function chatUser(chat: string, jid: string): ChatUser {
    const g = global as any;
    g.db ||= { data: { users: {}, chats: {} } };
    const data = g.db.data;
    data.chats ||= {};
    const chatDb = (data.chats[chat] ||= {});
    chatDb.users ||= {};
    const cu = (chatDb.users[jid] ||= { coins: 0, bank: 0 });
    cu.coins = Math.max(0, Math.floor(num(cu.coins)));
    cu.bank = Math.max(0, Math.floor(num(cu.bank)));
    cu.rpg = normalizePlayer(cu.rpg);
    return cu as ChatUser;
}

export const savePlayer = (chat: string, jid: string): void => saveDB(chat, jid);

export const displayName = (jid: string): string => {
    const name = (global as any).db?.data?.users?.[jid]?.name;
    return name && name !== 'Usuario' ? name : `@${String(jid).split('@')[0]}`;
};

// ───────────────────────── jefe del chat ─────────────────────────

export type Boss = { n: number; name: string; hp: number; max: number; atk: number; def: number; dmg: Record<string, number> };

const BOSS_NAMES = ['🐗 Jabalí colosal', '🦂 Escorpión rey', '🐙 Kraken', '🧛 Conde vampiro', '🦖 Tiranosaurio', '👁️ Observador', '🔥 Señor del fuego', '🐉 Dragón ancestral'];

export function newBoss(n: number): Boss {
    const max = Math.round(1500 * Math.pow(1.55, n));
    return { n, name: BOSS_NAMES[n % BOSS_NAMES.length], hp: max, max, atk: 18 + 7 * n, def: 3 + 3 * n, dmg: {} };
}

export const getBoss = (chat: string): Boss => kvGet<Boss>(`boss:${chat}`) || newBoss(0);
export const saveBoss = (chat: string, boss: Boss): void => kvSet(`boss:${chat}`, boss);

// ───────────────────────── duelos pendientes ─────────────────────────

export type Challenge = { from: string; to: string; bet: number; ts: number };
export const challenges = new Map<string, Challenge>();
export const CHALLENGE_TTL_MS = 90_000;
export const challengeKey = (chat: string, to: string): string => `${chat}|${to}`;

// ───────────────────────── envoltorio de los comandos ─────────────────────────

export type RpgCtx = {
    ctx: any;
    sock: any;
    chat: string;
    /** Identificador de quien envía (la misma clave que usa la economía). */
    jid: string;
    cu: ChatUser;
    p: Player;
    args: string[];
    /** Prefijo de los comandos. */
    px: string;
    name: string;
    reply: (text: string, mentions?: string[]) => Promise<any>;
    save: () => void;
    /** Persona mencionada o a cuyo mensaje se responde. */
    target: () => string | null;
};

type RpgCommand = {
    command: string[];
    description: string;
    usage?: string;
    /** Clave de `COOLDOWNS`: si falta tiempo, se avisa y no se ejecuta. */
    cooldown?: string;
    /** No se puede usar con la vida en 0. */
    alive?: boolean;
    run: (r: RpgCtx) => Promise<any> | any;
};

/** Crea un comando del RPG: prepara el personaje, valida y guarda al terminar. */
export function rpgCommand(def: RpgCommand) {
    return {
        command: def.command,
        description: def.description,
        usage: def.usage,
        category: 'rpg',
        run: async (ctx: any) => {
            const { sock, chat } = ctx;
            const m = ctx.m || ctx.msg;
            const px = ctx.usedPrefix || ctx.prefix || config.prefix || '.';
            const reply = (text: string, mentions?: string[]) =>
                sock.sendMessage(chat, mentions?.length ? { text, mentions } : { text }, { quoted: m });

            try {
                const jid = (await UserJid(sock, chat, ctx.sender || m?.sender)) || ctx.sender || m?.sender;
                if (!jid) return reply('✿ No pude identificarte. Inténtalo de nuevo.');

                const cu = chatUser(chat, jid);
                const p = cu.rpg;

                if (def.alive && p.hp <= 0) {
                    return reply(`💀 Estás fuera de combate.\n\n> Recupérate con *${px}descansar*, *${px}curar* o *${px}usar pocion*.`);
                }
                if (def.cooldown) {
                    const left = waitFor(p, def.cooldown);
                    if (left > 0) {
                        return reply(`⏳ Debes esperar *${timeLeft(left)}* para volver a usar *${px}${def.command[0]}*.`);
                    }
                }

                const info = m?.message?.extendedTextMessage?.contextInfo;
                const target = (): string | null => {
                    const raw = info?.mentionedJid?.[0] || info?.participant || null;
                    if (!raw) return null;
                    return UserJid(sock, chat, raw) || raw;
                };

                const result = await def.run({
                    ctx, sock, chat, jid, cu, p, px,
                    args: (ctx.args || []).filter(Boolean),
                    name: m?.pushName || 'Aventurero',
                    reply,
                    save: () => savePlayer(chat, jid),
                    target
                });
                savePlayer(chat, jid);
                return result;
            } catch (e) {
                console.error(`Error en ${def.command[0]}:`, e);
                return reply('✿ Ocurrió un error al ejecutar el comando.');
            }
        }
    };
}
