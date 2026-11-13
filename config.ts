import { loadSettings, watchSettings, resolveBanner, resolveMenuBanner, defaultSettings } from './lib/settings.ts';
import type { Settings, MenuStyle, MenuTheme, LogMode, Reactions, ClockView } from './lib/settings.ts';

/**
 * Configuración de Denji bot.
 *
 * Los valores salen de `settings.json` (se crea/edita desde el panel de
 * `npm start` → "Personalizar bot"). Los valores por defecto están en
 * `lib/settings.ts`. Este objeto se actualiza en caliente cuando cambian
 * los ajustes, sin reiniciar el bot.
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
    menuTheme: 'denji' as MenuTheme,
    /** Banner del menú según el estilo activo. */
    menuBanner: '',
    reactions: structuredClone(defaultSettings.reactions) as Reactions,
    /** Cómo responde el comando de la hora. */
    clockView: 'auto' as ClockView,
    /** Servidores por los que los juegos HTML guardan y se conectan. */
    gameServers: [...defaultSettings.gameServers],
    logMode: 'detallado' as LogMode
};

function applySettings(s: Settings): void {
    config.botName = s.botName;
    config.devName = s.devName;
    config.prefix = s.prefix;
    config.coin = s.coin;
    config.menuStyle = s.menuStyle;
    config.menuTheme = s.menuTheme;
    config.menuBanner = resolveMenuBanner(s);
    config.reactions = s.reactions;
    config.clockView = s.clockView;
    config.gameServers = s.gameServers;
    config.logMode = s.logMode;
    config.banner = resolveBanner(s.banner);
    config.icon = config.banner;

    config.owner.clear();
    for (const number of s.owners) config.owner.add(number);

    (globalThis as any).botName = s.botName;
}

applySettings(loadSettings());
watchSettings(applySettings);

export default config;
