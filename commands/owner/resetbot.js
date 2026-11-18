import db from '#db';
import { loadSettings, resetSettings, defaultSettings } from '#settings';
import { clearRuntimeCaches } from '#simple';
import {
  inspectBotData,
  wipeBotData,
  WIPE_PRESETS,
  formatDataBytes,
  disconnectSubBots,
  disconnectMainSocket
} from '#wipe';

const CONFIRM_TTL_MS = 60_000;
const pendingConfirm = new Map();

const CONFIRM_WORDS = new Set(['confirmar', 'confirm', 'confirmo', 'borrar']);
const CANCEL_WORDS = new Set(['cancelar', 'cancel', 'anular']);

const MODE_ALIASES = {
  todo: 'all',
  all: 'all',
  full: 'all',
  total: 'all',
  fabrica: 'all',
  factory: 'all',

  datos: 'keepSession',
  sinsesion: 'keepSession',
  'sin-sesion': 'keepSession',
  keepsession: 'keepSession',
  parcial: 'keepSession',

  db: 'database',
  bd: 'database',
  database: 'database',
  basedatos: 'database',

  subs: 'subs',
  subbots: 'subs',
  jadibots: 'subs',

  ajustes: 'settings',
  settings: 'settings',
  config: 'settings',

  tmp: 'temp',
  temp: 'temp',
  cache: 'temp',
  logs: 'temp'
};

const MODE_INFO = {
  all: {
    title: 'Restablecimiento total (fábrica)',
    warning:
      'Se eliminarán la *base de datos* (usuarios, grupos, economía, gacha, niveles y packs), *todas las sesiones* de WhatsApp, los *sub-bots*, los *ajustes* (`settings.json`) y los *archivos temporales*.\n' +
      '> ⚠ El bot cerrará sesión y se apagará. Tendrás que vincularlo de nuevo desde la terminal con *npm start*.'
  },
  keepSession: {
    title: 'Datos, sub-bots y ajustes (sin cerrar sesión)',
    warning:
      'Se eliminarán la *base de datos* completa, todos los *sub-bots*, los *archivos temporales* y se restablecerán los *ajustes* a sus valores iniciales.\n' +
      '> ✓ Se conservan la sesión principal de WhatsApp y los dueños configurados.'
  },
  database: {
    title: 'Solo base de datos y caché',
    warning:
      'Se eliminarán todos los *usuarios*, *grupos*, *monedas*, *personajes gacha*, *niveles*, *perfiles*, *advertencias* y *packs de stickers*, además de la caché temporal.\n' +
      '> ✓ Se conservan las sesiones, los sub-bots y los ajustes.'
  },
  subs: {
    title: 'Solo sesiones de sub-bots',
    warning:
      'Se desconectarán y eliminarán todas las sesiones guardadas de *Sub-Bots* (`Sessions/`).\n' +
      '> ✓ Se conservan la sesión principal, la base de datos y los ajustes.'
  },
  settings: {
    title: 'Solo ajustes del bot',
    warning:
      'Se restablecerán nombre, prefijo, moneda, tema/formato del menú, banners, reacciones y logs.\n' +
      '> ✓ Se conservan los dueños, la sesión activa y la base de datos.'
  }
};

function cleanToken(raw = '') {
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of pendingConfirm) {
    if (now >= entry.expiresAt) pendingConfirm.delete(key);
  }
}

function renderStatus(info, usedPrefix, command) {
  const dbLine = info.database.exists
    ? `*${formatDataBytes(info.database.bytes)}* _(${info.database.users} usuarios · ${info.database.groups} grupos)_`
    : '_vacía_';
  const sessLine = info.sessions.exists
    ? `*${info.sessions.count}* _(${formatDataBytes(info.sessions.bytes)})_`
    : '_ninguna_';
  const subsLine = info.subs.exists
    ? `*${info.subs.count}* _(${formatDataBytes(info.subs.bytes)})_`
    : '_ninguno_';
  const setLine = info.settings.exists ? `*${formatDataBytes(info.settings.bytes)}*` : '_por defecto_';
  const tmpLine = info.temp.exists
    ? `*${info.temp.files} archivo(s)* _(${formatDataBytes(info.temp.bytes)})_`
    : '_limpio_';

  return (
    `✿ *Gestión y eliminación de datos*\n\n` +
    `❖ *Base de datos ›* ${dbLine}\n` +
    `❖ *Sesiones ›* ${sessLine}\n` +
    `❖ *Sub-Bots ›* ${subsLine}\n` +
    `❖ *Ajustes ›* ${setLine}\n` +
    `❖ *Temporales ›* ${tmpLine}\n` +
    `❖ *Total ocupado ›* *${formatDataBytes(info.totalBytes)}*\n\n` +
    `> ✎ *Opciones disponibles:*\n` +
    `> » *${usedPrefix + command} todo* — Eliminar TODOS los datos y desvincular\n` +
    `> » *${usedPrefix + command} datos* — Borrar BD, sub-bots y ajustes (sin cerrar sesión)\n` +
    `> » *${usedPrefix + command} db* — Borrar solo la base de datos\n` +
    `> » *${usedPrefix + command} subs* — Eliminar todos los sub-bots\n` +
    `> » *${usedPrefix + command} ajustes* — Restablecer ajustes iniciales\n` +
    `> » *${usedPrefix + command} tmp* — Limpiar caché y registros`
  );
}

async function executeWipe(mode, { msg, sock }) {
  const botNum = String(sock?.user?.id || '').split('@')[0].split(':')[0];
  const botJid = botNum ? `${botNum}@s.whatsapp.net` : '';

  if (mode === 'temp') {
    const res = wipeBotData(WIPE_PRESETS.temp);
    clearRuntimeCaches();
    return msg.reply(
      `✿ *Caché y registros limpiados*\n` +
        `> Espacio liberado: *${formatDataBytes(res.freedBytes)}*`
    );
  }

  if (mode === 'settings') {
    const current = loadSettings();
    const next = resetSettings({
      owners: current.owners,
      activeSession: current.activeSession
    });
    if (botJid) {
      const shortName = next.botName.trim().split(/\s+/)[0] || 'Denji';
      db.updateSettings(botJid, {
        botname: next.botName,
        namebot: shortName,
        currency: next.coin,
        prefix: Array.from(new Set([defaultSettings.prefix, '/', '!', '.', '#'])),
        banner: '',
        icon: ''
      });
    }
    return msg.reply(
      `✿ *Ajustes restablecidos a valores iniciales*\n` +
        `> Se conservaron los dueños y la sesión activa.`
    );
  }

  if (mode === 'subs') {
    const before = inspectBotData();
    const closed = await disconnectSubBots({ logout: true });
    const res = wipeBotData(WIPE_PRESETS.subs);
    if (!res.ok) {
      return msg.reply(`《✧》 No se pudieron eliminar todos los sub-bots: *${res.failed.join(', ')}*`);
    }
    const count = Math.max(before.subs.count, closed);
    return msg.reply(
      `✿ *Sub-Bots eliminados correctamente*\n` +
        `> Sesiones eliminadas: *${count}*\n` +
        `> Espacio liberado: *${formatDataBytes(res.freedBytes)}*`
    );
  }

  if (mode === 'database') {
    const dbRes = db.wipeAllData({ keepBotSettings: true });
    const tmpRes = wipeBotData(WIPE_PRESETS.temp);
    clearRuntimeCaches();
    const freed = dbRes.freedBytes + tmpRes.freedBytes;
    return msg.reply(
      `✿ *Base de datos eliminada correctamente*\n\n` +
        `❖ *Usuarios borrados ›* ${dbRes.users}\n` +
        `❖ *Chats borrados ›* ${dbRes.chats}\n` +
        `❖ *Personajes borrados ›* ${dbRes.characters}\n` +
        `❖ *Packs borrados ›* ${dbRes.packs}\n` +
        `❖ *Espacio liberado ›* ${formatDataBytes(freed)}`
    );
  }

  if (mode === 'keepSession') {
    const before = inspectBotData();
    const closed = await disconnectSubBots({ logout: true });
    const dbRes = db.wipeAllData({ keepBotSettings: false });
    const fsRes = wipeBotData({
      database: false,
      sessions: false,
      subs: true,
      settings: true,
      temp: true,
      keepOwners: true,
      keepActiveSession: true
    });
    clearRuntimeCaches();
    if (botJid) db.getSettings(botJid);

    const freed = dbRes.freedBytes + fsRes.freedBytes;
    const underPanel = typeof process.send === 'function';

    await msg.reply(
      `✿ *Datos del bot eliminados correctamente*\n\n` +
        `❖ *Usuarios borrados ›* ${dbRes.users}\n` +
        `❖ *Chats borrados ›* ${dbRes.chats}\n` +
        `❖ *Sub-Bots borrados ›* ${Math.max(before.subs.count, closed)}\n` +
        `❖ *Ajustes ›* restablecidos _(dueños y sesión conservados)_\n` +
        `❖ *Espacio liberado ›* ${formatDataBytes(freed)}` +
        (underPanel ? `\n\n> Reiniciando el bot para aplicar el estado limpio…` : '')
    );

    if (underPanel) {
      setTimeout(() => {
        try { process.send({ type: 'restart' }); } catch {}
      }, 600).unref();
    }
    return;
  }

  // mode === 'all' — Restablecimiento total de fábrica.
  const before = inspectBotData();
  await msg.reply(
    `✿ *Eliminando todos los datos del bot…*\n\n` +
      `❖ *Base de datos ›* ${before.database.users} usuarios · ${before.database.groups} grupos\n` +
      `❖ *Sesiones ›* ${before.sessions.count} principal(es) · ${before.subs.count} sub-bot(s)\n` +
      `❖ *Ajustes y caché ›* ${formatDataBytes(before.totalBytes)} en total\n\n` +
      `> El bot cerrará sesión y se apagará ahora. Ejecuta *npm start* en la terminal para vincularlo de nuevo.`
  );

  globalThis.__denjiWiping = true;
  clearRuntimeCaches();

  const finalize = async () => {
    try {
      await disconnectSubBots({ logout: true });
      await disconnectMainSocket(sock, { logout: true });
      if (globalThis.sock && globalThis.sock !== sock) {
        await disconnectMainSocket(globalThis.sock, { logout: true });
      }
    } catch {}

    if (typeof process.send === 'function') {
      try {
        process.send({ type: 'wipe_all' });
        // Respaldo por si el canal IPC no responde a tiempo.
        setTimeout(() => {
          try { db.closeDB(); } catch {}
          try { wipeBotData(WIPE_PRESETS.all); } catch {}
          process.exit(0);
        }, 4500).unref();
        return;
      } catch {}
    }

    try { db.closeDB(); } catch {}
    const res = wipeBotData(WIPE_PRESETS.all);
    console.log(
      res.ok
        ? `[ RESET ] Todos los datos del bot fueron eliminados (${formatDataBytes(res.freedBytes)}).`
        : `[ RESET ] Error al eliminar algunos datos: ${res.failed.join(', ')}.`
    );
    process.exit(0);
  };

  setTimeout(() => { void finalize(); }, 250).unref();
}

export async function before({ msg, sock, isOwner }) {
  if (!pendingConfirm.size || !isOwner) return false;
  purgeExpired();
  const key = `${msg.chat}:${msg.sender}`;
  const pending = pendingConfirm.get(key);
  if (!pending) return false;

  const raw = cleanToken(msg.text || '');
  if (!raw || raw.includes(' ')) return false;

  if (CANCEL_WORDS.has(raw)) {
    pendingConfirm.delete(key);
    await msg.reply('ꕥ Eliminación de datos cancelada.');
    return true;
  }

  if (CONFIRM_WORDS.has(raw)) {
    pendingConfirm.delete(key);
    await executeWipe(pending.mode, { msg, sock });
    return true;
  }

  return false;
}

export default {
  command: ['resetbot', 'wipedata', 'borrardatos', 'cleardata', 'factoryreset'],
  category: 'owner',
  description: 'Eliminar todos los datos del bot o reiniciar su base de datos.',
  isOwner: true,
  before,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    purgeExpired();
    const key = `${msg.chat}:${msg.sender}`;
    const first = cleanToken(args[0] || '');
    const second = cleanToken(args[1] || '');

    if (!first) {
      if (command === 'factoryreset') {
        pendingConfirm.set(key, { mode: 'all', expiresAt: Date.now() + CONFIRM_TTL_MS });
        const meta = MODE_INFO.all;
        return msg.reply(
          `⚠ *Confirmar: ${meta.title}*\n\n` +
            `${meta.warning}\n\n` +
            `> Para confirmar en los próximos *60s*, responde *confirmar* o usa *${usedPrefix + command} confirmar*.\n` +
            `> Para anular, responde *cancelar* o usa *${usedPrefix + command} cancelar*.`
        );
      }
      const info = inspectBotData();
      return msg.reply(renderStatus(info, usedPrefix, command));
    }

    if (CANCEL_WORDS.has(first)) {
      if (!pendingConfirm.delete(key)) {
        return msg.reply('《✧》 No hay ninguna eliminación pendiente por cancelar.');
      }
      return msg.reply('ꕥ Eliminación de datos cancelada.');
    }

    if (CONFIRM_WORDS.has(first)) {
      const pending = pendingConfirm.get(key);
      if (!pending) {
        if (command === 'factoryreset') {
          return executeWipe('all', { msg, sock });
        }
        return msg.reply(
          `《✧》 No tienes ninguna eliminación pendiente (o expiró).\n` +
            `> Usa *${usedPrefix + command}* para ver las opciones.`
        );
      }
      pendingConfirm.delete(key);
      return executeWipe(pending.mode, { msg, sock });
    }

    const mode = MODE_ALIASES[first];
    if (!mode) {
      return msg.reply(
        `《✧》 Opción *${args[0]}* no reconocida.\n` +
          `> Opciones: *todo*, *datos*, *db*, *subs*, *ajustes*, *tmp*\n` +
          `> Usa *${usedPrefix + command}* para ver el detalle.`
      );
    }

    // La limpieza de caché temporal no borra datos del usuario: se ejecuta al momento.
    if (mode === 'temp') {
      pendingConfirm.delete(key);
      return executeWipe('temp', { msg, sock });
    }

    // Confirmación directa en un solo paso: `.resetbot todo confirmar`
    if (CONFIRM_WORDS.has(second)) {
      pendingConfirm.delete(key);
      return executeWipe(mode, { msg, sock });
    }

    pendingConfirm.set(key, {
      mode,
      expiresAt: Date.now() + CONFIRM_TTL_MS
    });

    const meta = MODE_INFO[mode];
    return msg.reply(
      `⚠ *Confirmar: ${meta.title}*\n\n` +
        `${meta.warning}\n\n` +
        `> Para confirmar en los próximos *60s*, responde *confirmar* o usa *${usedPrefix + command} confirmar*.\n` +
        `> Para anular, responde *cancelar* o usa *${usedPrefix + command} cancelar*.`
    );
  }
};
