import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import chalk from 'chalk';
import { ROOT } from './settings.ts';

export interface CommandEntry {
    pluginKey: string;
    run: (ctx: any) => Promise<any>;
    category: string;
    description: string;
    usage: string;
    aliases: string[];
    isOwner: boolean;
    isAdmin: boolean;
    botAdmin: boolean;
    isGroup: boolean;
    customPrefix: any;
}

export interface HookEntry {
    key: string;
    type: 'all' | 'before';
    fn: (ctx: any) => Promise<any>;
    dirname: string;
}

const g = globalThis as any;
const commandsFolder = path.join(ROOT, 'commands');
const pluginCache = new Map<string, { mtime: number; mod: any }>();
const debounceMap = new Map<string, NodeJS.Timeout>();
const watchers = new Map<string, fs.FSWatcher>();

g.comandos ??= new Map<string, CommandEntry>();
g.plugins ??= {};
g.cmdsExecute ??= [] as HookEntry[];
g.commandRevision ??= 0;

const isPluginFile = (name: string): boolean =>
    (name.endsWith('.js') || name.endsWith('.ts')) && !name.endsWith('.d.ts');

function pluginKeyOf(filePath: string): string {
    return path.relative(commandsFolder, filePath).replace(/\\/g, '/').replace(/\.(js|ts)$/, '');
}

const normalizeCmd = (s: string): string =>
    s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function registerModule(filePath: string, mod: any): void {
    g.commandRevision = (g.commandRevision || 0) + 1;
    const key = pluginKeyOf(filePath);

    // No registrar como comando el módulo de eventos de socket.
    if (key === 'events') return;

    for (const [cmd, data] of g.comandos as Map<string, CommandEntry>) {
        if (data.pluginKey === key) g.comandos.delete(cmd);
    }
    g.cmdsExecute = (g.cmdsExecute as HookEntry[]).filter(p => p.key !== key);

    const cmd = mod?.default?.default || mod?.default;
    const dirname = path.dirname(filePath);
    const allFn = typeof cmd?.all === 'function' ? cmd.all : typeof mod?.all === 'function' ? mod.all : null;
    const beforeFn = typeof cmd?.before === 'function' ? cmd.before : typeof mod?.before === 'function' ? mod.before : null;

    const rawCmds: string[] = Array.isArray(cmd?.command)
        ? cmd.command.map(String)
        : cmd?.command
            ? [String(cmd.command)]
            : [];
    const aliases = Array.from(new Set(rawCmds.map(c => c.toLowerCase().trim()).filter(Boolean)));

    g.plugins[key] = {
        ...(cmd && typeof cmd === 'object' ? cmd : mod),
        dirname,
        ...(aliases.length ? { command: aliases } : {}),
        ...(beforeFn ? { before: beforeFn } : {}),
        ...(allFn ? { all: allFn } : {})
    };

    if (allFn) g.cmdsExecute.push({ key, type: 'all', fn: allFn, dirname });
    if (beforeFn) g.cmdsExecute.push({ key, type: 'before', fn: beforeFn, dirname });

    if (typeof cmd?.run !== 'function') return;

    const keys = aliases.length > 0
        ? aliases
        : cmd.customPrefix
            ? [key.split('/').pop()!.toLowerCase()]
            : [];
    if (!keys.length) return;

    const entry: CommandEntry = {
        pluginKey: key,
        run: cmd.run,
        category: String(cmd.category || 'utils').toLowerCase(),
        description: String(cmd.description || ''),
        usage: String(cmd.usage || ''),
        aliases: keys,
        isOwner: Boolean(cmd.isOwner || cmd.owner),
        isAdmin: Boolean(cmd.isAdmin || cmd.admin),
        botAdmin: Boolean(cmd.botAdmin),
        isGroup: Boolean(cmd.isGroup || cmd.group),
        customPrefix: cmd.customPrefix ?? null
    };

    for (const c of keys) {
        g.comandos.set(c, entry);
        const norm = normalizeCmd(c);
        if (norm && !g.comandos.has(norm)) g.comandos.set(norm, entry);
    }
}

async function importModule(filePath: string, force = false): Promise<any> {
    const mtime = fs.statSync(filePath).mtimeMs;
    const cached = pluginCache.get(filePath);
    if (!force && cached?.mtime === mtime) return cached.mod;
    const url = `${pathToFileURL(filePath).href}?v=${force ? Date.now() : mtime}`;
    const mod = await import(url);
    pluginCache.set(filePath, { mtime, mod });
    return mod;
}

function collectFiles(dir: string, out: string[] = []): string[] {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectFiles(full, out);
            continue;
        }
        if (isPluginFile(entry.name)) out.push(full);
    }
    return out;
}

export async function scanCommands(force = false): Promise<{ total: number; commands: number; errors: number }> {
    const files = collectFiles(commandsFolder);
    const results = await Promise.allSettled(
        files.map(async filePath => {
            const mod = await importModule(filePath, force);
            registerModule(filePath, mod);
        })
    );
    let errCount = 0;
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'rejected') {
            errCount++;
            console.error(chalk.gray(`[ ✿ ] Error cargando ${path.basename(files[i])}: ${r.reason?.message ?? r.reason}`));
        }
    }
    const uniquePlugins = new Set(Array.from((g.comandos as Map<string, CommandEntry>).values()).map(c => c.pluginKey)).size;
    if (typeof g.broadcast === 'function') {
        g.broadcast('plugins_loaded', { count: uniquePlugins });
    }
    return { total: files.length, commands: g.comandos.size, errors: errCount };
}

async function reloadFile(filePath: string): Promise<void> {
    if (!isPluginFile(filePath)) return;
    if (!fs.existsSync(filePath)) {
        g.commandRevision = (g.commandRevision || 0) + 1;
        pluginCache.delete(filePath);
        const key = pluginKeyOf(filePath);
        for (const [cmd, data] of g.comandos as Map<string, CommandEntry>) {
            if (data.pluginKey === key) g.comandos.delete(cmd);
        }
        g.cmdsExecute = (g.cmdsExecute as HookEntry[]).filter(p => p.key !== key);
        delete g.plugins[key];
        return;
    }
    const mtime = fs.statSync(filePath).mtimeMs;
    if (pluginCache.get(filePath)?.mtime === mtime) return;
    try {
        const mod = await importModule(filePath);
        registerModule(filePath, mod);
        if (path.basename(filePath) !== 'events.js') {
            console.log(chalk.gray(`[ ✿ ] Plugin recargado: ${path.basename(filePath)}`));
        }
    } catch (e: any) {
        console.error(chalk.gray(`[ ✿ ] Error recargando ${path.basename(filePath)}: ${e?.message || e}`));
    }
}

g.reload = (_: any, filePath: string) => {
    if (!filePath || !isPluginFile(filePath)) return;
    const prev = debounceMap.get(filePath);
    if (prev) clearTimeout(prev);
    debounceMap.set(
        filePath,
        setTimeout(() => {
            debounceMap.delete(filePath);
            reloadFile(filePath).catch(() => {});
        }, 300)
    );
};

function watchDir(dir: string): void {
    if (watchers.has(dir) || !fs.existsSync(dir)) return;
    try {
        const w = fs.watch(dir, (event, filename) => {
            if (filename && isPluginFile(filename)) {
                const full = path.join(dir, filename);
                if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
                    watchDir(full);
                } else {
                    g.reload(event, full);
                }
            }
        });
        w.unref();
        watchers.set(dir, w);
    } catch {}
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) watchDir(path.join(dir, entry.name));
    }
}

export default async function cmdsLoader(watch = true): Promise<void> {
    const t = Date.now();
    const { total, commands, errors } = await scanCommands(false);
    const ms = Date.now() - t;
    console.log(
        chalk.gray(
            `[ ✿ ] ${commands} alias en ${total} archivos cargados en ${ms}ms${errors > 0 ? ` · ${errors} con errores` : ''}`
        )
    );
    if (watch) watchDir(commandsFolder);
}
