import {
  loadSettings,
  saveSettings,
  MENU_THEMES,
  MENU_THEME_NAMES,
  MENU_STYLES,
  MENU_STYLE_NAMES,
  MENU_STYLE_HINTS
} from '../../lib/settings.ts';
import { sampleMenu } from '../../lib/menustyles.ts';

const THEME_DESCRIPTIONS = {
  yuki: 'Estética delicada inspirada en YukiBot-MD (bordes suaves, ✿ y ꕤ)',
  denji: 'Marco clásico de DenjiBot, limpio y directo',
  chainsaw: 'Estilo Chainsaw Man con sierras, cadenas y separadores marcados',
  mystic: 'Inspirado en TheMystic-Bot-MD (marcos dobles, estrellas ✯ y <SECCIÓN/>)',
  gata: 'Inspirado en GataBot-MD (etiquetas ❰❰ ❱❱, flechas ➺ y checks ✓)',
  alya: 'Inspirado en AlyaBot-MD (cintas onduladas, ❖ y kaomojis suaves)',
  michi: 'Inspirado en MichiBot (estilo botánico con gatitos 🐱, 🍃 y 🍀)',
  loli: 'Inspirado en LoliBot-MD (encabezados compactos `<[ SECCIÓN ]>`)',
  shadow: 'Inspirado en ShadowBot-MD (estética oscura con glifos 𖤐 y ⌬)',
  simple: 'Minimalista, sin adornos y ultra rápido de leer'
};

export default {
  command: ['setmenu', 'menustyle'],
  category: 'owner',
  description: 'Cambiar tema visual, formato o banner del menú.',
  isOwner: true,
  run: async ({ msg, args, usedPrefix, command }) => {
    const s = loadSettings();
    const sub = (args[0] || '').toLowerCase();

    if (!sub) {
      const themes = MENU_THEMES
        .map(t => `${t === s.menuTheme ? '●' : '○'} *${t}* — ${MENU_THEME_NAMES[t]} _(${THEME_DESCRIPTIONS[t]})_`)
        .join('\n');
      const styles = MENU_STYLES
        .map(m => `${m === s.menuStyle ? '●' : '○'} *${m}* — ${MENU_STYLE_NAMES[m]} _(${MENU_STYLE_HINTS[m]})_`)
        .join('\n');
      const curBanner = s.menuBanners?.[s.menuTheme] || s.banner || '(sin banner)';

      return msg.reply(
        `✿ *Configuración del Menú*\n\n` +
        `*Temas visuales:*\n${themes}\n\n` +
        `*Formatos de vista:*\n${styles}\n\n` +
        `*Banner (${s.menuTheme}):* ${curBanner}\n\n` +
        `> ✎ *Uso:*\n` +
        `> » *${usedPrefix + command} <${MENU_THEMES.join('|')}>*\n` +
        `> » *${usedPrefix + command} <${MENU_STYLES.join('|')}>*\n` +
        `> » *${usedPrefix + command} preview <tema>*\n` +
        `> » *${usedPrefix + command} banner <url|off>*`
      );
    }

    if (sub === 'preview' || sub === 'ver') {
      const t = (args[1] || s.menuTheme).toLowerCase();
      if (!MENU_THEMES.includes(t)) {
        return msg.reply(`《✧》 Tema no válido. Opciones: *${MENU_THEMES.join(', ')}*`);
      }
      const preview = sampleMenu(t, {
        botName: s.botName,
        shortName: s.botName.split(' ')[0],
        devName: s.devName || 'Lyan',
        coin: s.coin || 'Yenes',
        prefix: usedPrefix,
        user: msg.pushName || 'Usuario',
        total: 225,
        link: global.links?.github || '',
        uptime: '2h 15m'
      });
      return msg.reply(`✿ *Vista previa — ${MENU_THEME_NAMES[t]}*\n\n${preview}`);
    }

    if (sub === 'banner') {
      const val = args.slice(1).join(' ').trim();
      if (!val) {
        return msg.reply(`《✧》 Indica una URL de imagen/video o *off* para quitar el banner propio del tema *${s.menuTheme}*.`);
      }
      const banners = { ...s.menuBanners };
      if (['off', 'none', 'quitar', 'default'].includes(val.toLowerCase())) {
        banners[s.menuTheme] = '';
        saveSettings({ menuBanners: banners });
        return msg.reply(`✿ Banner personalizado restaurado por defecto en *${MENU_THEME_NAMES[s.menuTheme]}*.`);
      }
      if (!/^https?:\/\//i.test(val)) {
        return msg.reply('《✧》 Ingresa una URL válida que empiece con *http://* o *https://*.');
      }
      banners[s.menuTheme] = val;
      saveSettings({ menuBanners: banners });
      return msg.reply(`✿ Banner actualizado para el tema *${MENU_THEME_NAMES[s.menuTheme]}*.`);
    }

    if (MENU_THEMES.includes(sub)) {
      saveSettings({ menuTheme: sub });
      return msg.reply(
        `✿ Tema del menú cambiado a *${MENU_THEME_NAMES[sub]}*.\n` +
        `> ${THEME_DESCRIPTIONS[sub]}\n` +
        `> Prueba *${usedPrefix}menu* o *${usedPrefix}menu descargas*.`
      );
    }

    if (MENU_STYLES.includes(sub)) {
      saveSettings({ menuStyle: sub });
      return msg.reply(
        `✿ Formato del menú cambiado a *${MENU_STYLE_NAMES[sub]}*.\n` +
        `> ${MENU_STYLE_HINTS[sub]}\n` +
        `> Prueba *${usedPrefix}menu*.`
      );
    }

    return msg.reply(
      `《✧》 Opción *${sub}* no reconocida.\n` +
      `> Temas: *${MENU_THEMES.join(', ')}*\n` +
      `> Formatos: *${MENU_STYLES.join(', ')}*\n` +
      `> Otros: *preview <tema>*, *banner <url|off>*`
    );
  }
};
