import config from '#config';
import { saveSettings, MENU_STYLES, MENU_THEMES, MENU_THEME_NAMES } from '#settings';
import type { MenuTheme } from '#settings';

// Nombres con los que se puede pedir cada estilo.
const themeWords: Record<string, MenuTheme> = {
    denji: 'denji',
    chainsaw: 'chainsaw',
    chainsawman: 'chainsaw',
    csm: 'chainsaw',
    simple: 'simple'
};

export default {
    command: ['setmenu', 'menustyle'],
    category: 'owner',
    owner: true,
    run: async (ctx: any) => {
        const { args, reply, prefix, usedPrefix } = ctx;
        const p = usedPrefix || prefix || config.prefix || '.';
        const word = String(args[0] || '').toLowerCase();

        const theme = themeWords[word];
        if (theme) {
            saveSettings({ menuTheme: theme });
            config.menuTheme = theme;
            return reply(`ׅ  ׄ  ✿ Estilo del menú cambiado a *${MENU_THEME_NAMES[theme]}*.`);
        }

        if (MENU_STYLES.includes(word as any)) {
            saveSettings({ menuStyle: word as any });
            config.menuStyle = word as any;
            return reply(`ׅ  ׄ  ✿ Formato del menú cambiado a *${word}*.`);
        }

        return reply(
            `ׅ  ׄ  ✿ Estilo actual: *${MENU_THEME_NAMES[config.menuTheme]}* · formato: *${config.menuStyle}*\n\n` +
            `*Estilos*\n` +
            MENU_THEMES.map(t => `• *${p}setmenu ${t}* - ${MENU_THEME_NAMES[t]}`).join('\n') +
            `\n\n*Formato*\n` +
            `• *${p}setmenu lista* - Menú interactivo con lista de categorías.\n` +
            `• *${p}setmenu texto* - Menú clásico en un solo mensaje.`
        );
    }
};
