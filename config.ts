import { loadSettings, watchSettings, resolveBanner, resolveMenuBanner, defaultSettings } from './lib/settings.ts';
import type { Settings, MenuStyle, MenuTheme, LogMode, Reactions } from './lib/settings.ts';

/**
 * Configuración de Denji bot + variables globales de compatibilidad con los
 * comandos de YukiBot-MD.
 *
 * Los valores salen de `settings.json` (se crea/edita desde el panel de
 * `npm start` → "Personalizar bot") y se recargan en caliente sin reiniciar.
 */
export const config = {
    botName: 'Denji bot',
    devName: '',
    prefix: '.',
    owner: new Set<string>(),
    banner: '',
    icon: '',
    coin: '',
    menuStyle: 'lista' as MenuStyle,
    menuTheme: 'yuki' as MenuTheme,
    /** Banner del menú según el estilo activo. */
    menuBanner: '',
    reactions: structuredClone(defaultSettings.reactions) as Reactions,
    logMode: 'detallado' as LogMode
};

const g = globalThis as any;

g.links ??= {
    api: 'https://api.yuki-wabot.my.id',
    channel: 'https://whatsapp.com/channel/0029Vb64nWqLo4hb8cuxe23n',
    github: 'https://github.com/lyanvalentinmail-prog/DenjiBot',
    gmail: ''
};

g.my ??= {
    ch1: '120363401404146384@newsletter'
};

g.APIs ??= {
    yuki: { url: 'https://api.yuki-wabot.my.id', key: 'YukiBot-MD' },
    vreden: { url: 'https://api.vreden.web.id', key: null },
    ootaizumi: { url: 'https://api.ootaizumi.web.id', key: null },
    delirius: { url: 'https://api.delirius.online', key: null },
    zenzxz: { url: 'https://api.zenzxz.my.id', key: null },
    siputzx: { url: 'https://app.siputzx.my.id', key: null }
};

g.mess ??= {
    socket: '《✧》 Este comando solo puede ser ejecutado por un Socket.',
    admin: '《✧》 Este comando solo puede ser ejecutado por los Administradores del Grupo.',
    botAdmin: '《✧》 Este comando solo puede ser ejecutado si el Socket es Administrador del Grupo.'
};

g.multiplier ??= 2;
g.conns ??= [];
g.owner ??= [];

const listeners = new Set<(s: Settings) => void>();

export function onSettingsChange(fn: (s: Settings) => void): void {
    listeners.add(fn);
}

function applySettings(s: Settings): void {
    config.botName = s.botName;
    config.devName = s.devName;
    config.prefix = s.prefix;
    config.coin = s.coin;
    config.menuStyle = s.menuStyle;
    config.menuTheme = s.menuTheme;
    config.menuBanner = resolveMenuBanner(s);
    config.reactions = s.reactions;
    config.logMode = s.logMode;
    config.banner = resolveBanner(s.banner);
    config.icon = config.banner;

    config.owner.clear();
    for (const number of s.owners) config.owner.add(number);

    g.owner = [...s.owners];
    g.botName = s.botName;
    g.dev = s.devName;

    for (const fn of listeners) {
        try { fn(s); } catch {}
    }
}

applySettings(loadSettings());
watchSettings(applySettings);

export default config;
