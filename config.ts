import { loadSettings, watchSettings, resolveBanner } from './lib/settings.ts';
import type { Settings, MenuStyle, LogMode } from './lib/settings.ts';

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
    logMode: 'detallado' as LogMode
};

function applySettings(s: Settings): void {
    config.botName = s.botName;
    config.devName = s.devName;
    config.prefix = s.prefix;
    config.coin = s.coin;
    config.menuStyle = s.menuStyle;
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
