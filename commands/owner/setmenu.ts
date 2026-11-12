import config from '#config';
import { saveSettings, MENU_STYLES } from '#settings';

export default {
    command: ['setmenu', 'menustyle'],
    category: 'owner',
    owner: true,
    run: async (ctx: any) => {
        const { args, reply, prefix, usedPrefix } = ctx;
        const p = usedPrefix || prefix || config.prefix || '.';
        const style = args[0]?.toLowerCase();

        if (!MENU_STYLES.includes(style)) {
            return reply(
                `ׅ  ׄ  ✿ Estilo de menú actual: *${config.menuStyle}*\n\n` +
                `• *${p}setmenu lista* - Menú interactivo con lista de categorías.\n` +
                `• *${p}setmenu texto* - Menú clásico en un solo mensaje.`
            );
        }

        saveSettings({ menuStyle: style });
        config.menuStyle = style;

        return reply(`ׅ  ׄ  ✿ Estilo de menú cambiado a *${style}*.`);
    }
};
