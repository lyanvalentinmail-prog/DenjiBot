import fs from 'node:fs';
import path from 'node:path';
import { getDevice, prepareWAMessageMedia } from '@whiskeysockets/baileys';
import config from '#config';
import { ROOT } from '#settings';
import db from '#db';
import {
  listTexts,
  renderIndex,
  renderCategory,
  renderCommandHelp,
  renderMenu
} from '../../lib/menustyles.ts';
import { sendList } from '../../lib/interactive.ts';
import { loadSettings } from '../../lib/settings.ts';

const CATEGORIES = [
  {
    id: 'main',
    label: 'Principal',
    emoji: '✦',
    subtitle: 'Información, ping, estado y soporte',
    aliases: ['main', 'principal', 'inicio']
  },
  {
    id: 'downloads',
    label: 'Descargas',
    emoji: '📥',
    subtitle: 'YouTube, Spotify, TikTok, IG, Threads y más',
    aliases: ['downloads', 'download', 'descargas', 'descarga', 'dl']
  },
  {
    id: 'stickers',
    label: 'Stickers',
    emoji: '✨',
    subtitle: 'Stickers, WM, meme, TTP, brat, QC y packs',
    aliases: ['stickers', 'stikers', 'packs']
  },
  {
    id: 'utils',
    label: 'Utilidades',
    emoji: '⚙️',
    subtitle: 'IA, HD bigger.pics, sin fondo, Shazam, OCR y más',
    aliases: ['utils', 'util', 'utilidades', 'herramientas', 'tools']
  },
  {
    id: 'anime',
    label: 'Anime',
    emoji: '🌸',
    subtitle: 'Waifu, neko, whatanime, ppcouple y 66 reacciones',
    aliases: ['anime', 'reacciones', 'reaccion', 'reactions', 'interaccion']
  },
  {
    id: 'gacha',
    label: 'Gacha',
    emoji: '🎴',
    subtitle: 'Colecciona, reclama e intercambia waifus',
    aliases: ['gacha', 'waifus', 'personajes']
  },
  {
    id: 'economy',
    label: 'Economía',
    emoji: '💰',
    subtitle: 'Monedas, casino, tienda y aventuras RPG',
    aliases: ['economy', 'economia', 'eco', 'dinero', 'juegos']
  },
  {
    id: 'profile',
    label: 'Perfil',
    emoji: '👤',
    subtitle: 'Perfil, nivel, AFK, bodas y ranking',
    aliases: ['profile', 'perfil', 'perfiles', 'xp', 'niveles']
  },
  {
    id: 'group',
    label: 'Grupos',
    emoji: '🛡️',
    subtitle: 'Bienvenida, antilink, warns y moderación',
    aliases: ['group', 'groups', 'grupo', 'grupos', 'admin', 'admins', 'mod']
  },
  {
    id: 'socket',
    label: 'Sub-Bots',
    emoji: '⚡',
    subtitle: 'Sockets, prefijo, banner y ajustes del bot',
    aliases: ['socket', 'sockets', 'subbot', 'subbots', 'jadibot', 'serbot']
  },
  {
    id: 'owner',
    label: 'Owner',
    emoji: '👑',
    subtitle: 'Estilo del menú y control del propietario',
    aliases: ['owner', 'creador', 'dueno', 'propietario', 'dev']
  }
];

// Las 66 reacciones SFW de anime/shares.js organizadas en 5 grupos compactos.
const ANIME_REACTION_GROUPS = [
  {
    title: 'Afecto',
    items: ['kiss', 'hug', 'pat', 'cuddle', 'snuggle', 'handhold', 'blowkiss', 'kisscheek', 'love', 'comfort']
  },
  {
    title: 'Ánimo',
    items: ['happy', 'smile', 'laugh', 'blush', 'shy', 'seduce', 'smug', 'wink', 'cry', 'sad', 'pout', 'angry', 'bored', 'scared', 'cringe', 'dramatic']
  },
  {
    title: 'Travesuras',
    items: ['slap', 'punch', 'bonk', 'bite', 'lick', 'tickle', 'bully', 'push', 'step', 'spit', 'kill', 'bleh', 'nope', 'scream']
  },
  {
    title: 'Social',
    items: ['wave', 'highfive', 'clap', 'dance', 'sing', 'call', 'stare', 'peek', 'sniff', 'curious', 'think', 'thinkhard']
  },
  {
    title: 'Acciones',
    items: ['eat', 'coffee', 'sleep', 'bath', 'walk', 'run', 'jump', 'gaming', 'draw', 'drunk', 'smoke', 'cold', 'heat', 'trip']
  }
];

const USAGE_HINTS = {
  // main
  menu: '[categoría]',
  invite: '<enlace>',
  report: '<mensaje>',
  // downloads
  play: '<búsqueda|url>',
  play2: '<búsqueda|url>',
  ytsearch: '<búsqueda>',
  spotify: '<canción|url>',
  soundcloud: '<canción|url>',
  threads: '<enlace>',
  tiktok: '<url|texto>',
  ig: '<enlace>',
  fb: '<enlace>',
  twitter: '<enlace>',
  pinterest: '<búsqueda|url>',
  imagen: '<búsqueda>',
  apk: '<app>',
  mediafire: '<enlace>',
  gdrive: '<enlace>',
  // stickers
  sticker: '[img|video]',
  wm: '[pack | autor]',
  smeme: '<arriba | abajo>',
  ttp: '<texto>',
  attp: '<texto>',
  brat: '<texto>',
  bratv: '<texto>',
  qc: '<texto>',
  emojimix: '<😀+😎>',
  stickerpack: '<tema|url>',
  newpack: '<nombre>',
  addsticker: '<paquete>',
  delsticker: '<paquete>',
  getpack: '<paquete>',
  delpack: '<paquete>',
  setpackname: '<pack | nuevo>',
  setpackdesc: '<pack | desc>',
  setpackpublic: '<paquete>',
  setpackprivate: '<paquete>',
  setmeta: '<pack | autor>',
  // utils
  ia: '<pregunta>',
  hd: '[4x|anime|deblur|web]',
  removebg: '[sticker]',
  tomp3: '(cita video/audio)',
  toptt: '(cita video/audio)',
  shazam: '(cita audio/video)',
  lyrics: '<canción>',
  wikipedia: '<búsqueda>',
  clima: '<ciudad>',
  qrcode: '<texto|url>',
  ssweb: '<url>',
  calc: '<operación>',
  styletext: '<texto>',
  acortar: '<url>',
  ocr: '(cita imagen)',
  voz: '[idioma] <texto>',
  readmore: '<visible | oculto>',
  base64: '[dec] <texto>',
  morse: '<texto|código>',
  binario: '<texto|bits>',
  translate: '<idioma> <texto>',
  say: '<texto>',
  toimg: '(cita sticker)',
  tourl: '(cita archivo)',
  read: '(cita 1 vista)',
  getpic: '[@usuario]',
  get: '<url>',
  gitclone: '<url repo>',
  // anime
  hug: '[@usuario]',
  whatanime: '(cita imagen)',
  // gacha
  claim: '(cita roll)',
  charinfo: '<personaje>',
  charimage: '<personaje>',
  serieinfo: '<serie>',
  givechar: '@user <personaje>',
  trade: '<tuyo> / <suyo>',
  sell: '<precio> <personaje>',
  removesale: '<personaje>',
  buychar: '<personaje>',
  vote: '<personaje>',
  setfav: '<personaje>',
  deletewaifu: '<personaje>',
  robwaifu: '@usuario',
  setclaim: '<mensaje>',
  // economy
  deposit: '<cantidad|all>',
  withdraw: '<cantidad|all>',
  pay: '@user <cantidad>',
  steal: '@usuario',
  apostar: '<cantidad>',
  slot: '<cantidad>',
  rt: '<color> <cantidad>',
  cf: '<cara|cruz> <cant>',
  ppt: '<piedra|papel|tijera>',
  ttt: '[@usuario]',
  ahorcado: '',
  math: '[dificultad]',
  shop: '[objeto]',
  // profile
  profile: '[@usuario]',
  afk: '[motivo]',
  marry: '@usuario',
  setbirth: '<dd/mm/aaaa>',
  setgenre: '<género>',
  setdesc: '<texto>',
  sethobby: '<hobby>',
  // group
  bot: '<on|off>',
  del: '(cita mensaje)',
  admins: '[motivo]',
  encuesta: '<preg | op1 | op2>',
  mute: '@usuario',
  unmute: '@usuario',
  kick: '@usuario',
  promote: '@usuario',
  demote: '@usuario',
  warn: '@user [razón]',
  delwarn: '@usuario',
  warns: '[@usuario]',
  setwarnlimit: '<1-10>',
  hidetag: '<texto>',
  tagall: '[mensaje]',
  setwelcome: '<mensaje>',
  setgoodbye: '<mensaje>',
  setgpname: '<nombre>',
  setgpdesc: '<texto>',
  setprimary: '@bot',
  count: '[@usuario]',
  // socket
  code: '[número]',
  join: '<enlace>',
  self: '<on|off>',
  setprefix: '<prefijo>',
  setbotname: '<corto / largo>',
  setbotcurrency: '<moneda>',
  setbanner: '<url|imagen>',
  seticon: '<url|imagen>',
  setchannel: '<enlace canal>',
  setlink: '<url>',
  setbotowner: '@usuario',
  setstatus: '<texto>',
  setusername: '<nombre>',
  setpfp: '(cita imagen)',
  // owner
  setmenu: '[tema|formato]',
  resetbot: '[todo|datos|db|subs]',
  exec: '<código>',
  exec2: '<comando>'
};

const PREFERRED_NAME = {
  help: 'menu',
  ytmp3: 'play',
  ytmp4: 'play2',
  instagram: 'ig',
  facebook: 'fb',
  givecoins: 'pay',
  roulette: 'rt',
  coinflip: 'cf',
  readviewonce: 'read',
  setfavourite: 'setfav',
  setclaimmsg: 'setclaim',
  delclaimmsg: 'delclaim',
  infoeconomy: 'einfo',
  economyboard: 'eboard',
  setimage: 'setpfp',
  setbotname: 'setname',
  setbotcurrency: 'setcurrency',
  setbotowner: 'setowner',
  setstickerpackname: 'setpackname',
  setstickerpackdesc: 'setpackdesc',
  gp: 'groupinfo'
};

const GROUP_TOGGLE_ITEMS = [
  { cmd: ['welcome', 'bienvenida'], usage: '<on|off>', desc: 'Mensaje de bienvenida', admin: true },
  { cmd: ['goodbye', 'despedida'], usage: '<on|off>', desc: 'Mensaje de despedida', admin: true },
  { cmd: ['antilink'], usage: '<on|off>', desc: 'Eliminar enlaces de grupos', admin: true },
  { cmd: ['antistatus'], usage: '<on|off>', desc: 'Bloquear menciones de estado', admin: true },
  { cmd: ['alerts', 'alertas'], usage: '<on|off>', desc: 'Avisos de cambios en el grupo', admin: true },
  { cmd: ['economy', 'economia'], usage: '<on|off>', desc: 'Activar o pausar economía', admin: true },
  { cmd: ['gacha'], usage: '<on|off>', desc: 'Activar o pausar gacha', admin: true },
  { cmd: ['adminonly'], usage: '<on|off>', desc: 'Comandos solo para admins', admin: true }
];

function cleanStr(s = '') {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function shortenDesc(desc = '') {
  const s = String(desc || '').replace(/\s+/g, ' ').replace(/\.$/, '').trim();
  return s.length > 70 ? s.slice(0, 67).trimEnd() + '…' : s;
}

function formatUptime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function buildCatalog(usedPrefix) {
  const byCat = new Map();
  for (const cat of CATEGORIES) {
    byCat.set(cat.id, { commands: [], groups: undefined, groupsNote: undefined, count: 0 });
  }

  for (const [pluginKey, plugin] of Object.entries(global.plugins || {})) {
    if (!plugin?.command || typeof plugin.run !== 'function') continue;
    const catId = String(plugin.category || '').toLowerCase();
    if (!catId || catId === 'nsfw' || !byCat.has(catId)) continue;

    const bucket = byCat.get(catId);
    const aliases = (Array.isArray(plugin.command) ? plugin.command : [plugin.command])
      .map(c => String(c).trim().toLowerCase())
      .filter(Boolean);
    if (!aliases.length) continue;

    const normKey = pluginKey.replace(/\\/g, '/').replace(/\.[jt]s$/, '');

    // 1) 66 reacciones SFW agrupadas por estado de ánimo (sin saturar la pantalla).
    if (normKey.endsWith('anime/shares')) {
      bucket.groups = ANIME_REACTION_GROUPS;
      bucket.groupsNote = `También en español (${usedPrefix}besar, ${usedPrefix}abrazar, ${usedPrefix}feliz…) mencionando a @usuario`;
      bucket.count += ANIME_REACTION_GROUPS.reduce((sum, g) => sum + g.items.length, 0);
      continue;
    }

    // 2) waifu y neko separados con claridad.
    if (normKey.endsWith('anime/waifu')) {
      bucket.commands.push(
        { cmd: ['waifu'], usage: '', desc: 'Imagen aleatoria de waifu' },
        { cmd: ['neko'], usage: '', desc: 'Imagen aleatoria de neko' }
      );
      bucket.count += 2;
      continue;
    }

    // 3) Interruptores de grupo sin duplicar alias en español e inglés.
    if (normKey.endsWith('group/options')) {
      bucket.commands.push(...GROUP_TOGGLE_ITEMS);
      bucket.count += GROUP_TOGGLE_ITEMS.length;
      continue;
    }

    // 4) Sub-bots: code y qr claros.
    if (normKey.endsWith('socket/subs')) {
      bucket.commands.push(
        { cmd: ['code'], usage: '[número]', desc: 'Vincular Sub-Bot con código' },
        { cmd: ['qr'], usage: '', desc: 'Vincular Sub-Bot con código QR' }
      );
      bucket.count += 2;
      continue;
    }

    // 5) Efectos de audio agrupados con limpieza.
    if (normKey.endsWith('utils/audiofx')) {
      const fxList = aliases.filter(a => a !== 'audiofx');
      bucket.groups = [
        ...(bucket.groups || []),
        { title: 'Efectos de audio', items: fxList }
      ];
      bucket.groupsNote = `Responde a un audio o nota de voz con el efecto (ej.: ${usedPrefix}nightcore, ${usedPrefix}bass)`;
      bucket.count += fxList.length;
      continue;
    }

    // 6) ttp y attp separados con claridad.
    if (normKey.endsWith('stickers/ttp')) {
      bucket.commands.push(
        { cmd: ['ttp'], usage: '<texto>', desc: 'Sticker de texto con fondo transparente' },
        { cmd: ['attp'], usage: '<texto>', desc: 'Sticker de texto animado arcoíris' }
      );
      bucket.count += 2;
      continue;
    }

    // 7) tomp3 y toptt claros.
    if (normKey.endsWith('utils/tomp3')) {
      bucket.commands.push(
        { cmd: ['tomp3', 'toaudio'], usage: '(cita video)', desc: 'Convertir video o audio a MP3' },
        { cmd: ['toptt', 'tovn'], usage: '(cita audio)', desc: 'Convertir audio o video en nota de voz' }
      );
      bucket.count += 2;
      continue;
    }

    // 8) base64, morse y binario separados con claridad.
    if (normKey.endsWith('utils/base64')) {
      bucket.commands.push(
        { cmd: ['base64'], usage: '[dec] <texto>', desc: 'Codificar o decodificar texto en Base64' },
        { cmd: ['morse'], usage: '<texto|código>', desc: 'Convertir entre texto y código Morse' },
        { cmd: ['binario'], usage: '<texto|bits>', desc: 'Convertir entre texto y código binario' }
      );
      bucket.count += 3;
      continue;
    }

    // 9) mute y unmute separados con claridad.
    if (normKey.endsWith('group/mute')) {
      bucket.commands.push(
        { cmd: ['mute', 'silenciar'], usage: '@usuario', desc: 'Silenciar a un miembro del grupo', admin: true },
        { cmd: ['unmute', 'desilenciar'], usage: '@usuario', desc: 'Quitar silencio a un miembro', admin: true }
      );
      bucket.count += 2;
      continue;
    }

    const first = aliases[0];
    const pref = PREFERRED_NAME[first];
    const main = pref && aliases.includes(pref) ? pref : first;
    const ordered = [main, ...aliases.filter(a => a !== main)];

    bucket.commands.push({
      cmd: ordered,
      usage: USAGE_HINTS[main] || USAGE_HINTS[first] || '',
      desc: shortenDesc(plugin.description || ''),
      admin: Boolean(plugin.isAdmin)
    });
    bucket.count += 1;
  }

  const categories = [];
  for (const cat of CATEGORIES) {
    const bucket = byCat.get(cat.id);
    if (!bucket || (!bucket.commands.length && !bucket.groups?.length)) continue;
    bucket.commands.sort((a, b) => a.cmd[0].localeCompare(b.cmd[0]));
    categories.push({
      id: cat.id,
      name: cat.id,
      label: cat.label,
      subtitle: cat.subtitle,
      emoji: cat.emoji,
      aliases: cat.aliases,
      commands: bucket.commands,
      groups: bucket.groups,
      groupsNote: bucket.groupsNote,
      count: bucket.count
    });
  }
  return categories;
}

function collapseGroupsForFullMenu(categories, prefix) {
  return categories.map(cat => {
    if (!cat.groups?.length) return cat;
    const totalR = cat.groups.reduce((n, g) => n + g.items.length, 0);
    const summaryItem = cat.id === 'utils'
      ? {
          cmd: ['nightcore', 'bass'],
          usage: '(cita audio)',
          desc: `+${totalR - 1} efectos de audio (ver ${prefix}menu utils)`
        }
      : {
          cmd: ['hug', 'kiss'],
          usage: '[@user]',
          desc: `+${totalR - 1} reacciones (ver ${prefix}menu anime)`
        };
    return {
      ...cat,
      commands: [...cat.commands, summaryItem],
      groups: undefined,
      groupsNote: undefined
    };
  });
}

async function sendStyledMenu(sock, msg, text, meta) {
  const { banner, link, botname, namebot, devName, canalId, canalName, mentions } = meta;
  const validMentions = (mentions || []).filter(j => typeof j === 'string' && j.endsWith('@s.whatsapp.net'));
  const contextInfo = {
    mentionedJid: validMentions,
    ...(canalId
      ? {
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: canalId,
            serverMessageId: '0',
            newsletterName: canalName || botname
          }
        }
      : {})
  };

  const trimmed = String(text || '').trim();
  const isHttp = typeof banner === 'string' && /^https?:\/\//i.test(banner);
  const localFile =
    !isHttp && typeof banner === 'string' && banner
      ? path.isAbsolute(banner)
        ? banner
        : path.join(ROOT, banner)
      : '';
  const hasLocal = Boolean(localFile && fs.existsSync(localFile));
  const isVideo = typeof banner === 'string' && /\.(mp4|webm|gif)(\?.*)?$/i.test(banner);

  if (isVideo && (isHttp || hasLocal)) {
    try {
      const videoSource = isHttp ? { url: banner } : fs.readFileSync(localFile);
      return await sock.sendMessage(
        msg.chat,
        { video: videoSource, gifPlayback: true, caption: trimmed, contextInfo },
        { quoted: msg }
      );
    } catch {}
  }

  if (isHttp || hasLocal) {
    const targetUrl = link || global.links?.github || 'https://github.com/lyanvalentinmail-prog/DenjiBot';
    try {
      const imageSource = isHttp ? { url: banner } : fs.readFileSync(localFile);
      const { imageMessage } = await prepareWAMessageMedia(
        { image: imageSource },
        { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
      );
      return await sock.sendMessage(
        msg.chat,
        {
          text: trimmed,
          linkPreview: {
            'canonical-url': targetUrl,
            'matched-text': targetUrl,
            title: botname,
            description: `${namebot} · by ${devName}`,
            jpegThumbnail: imageMessage?.jpegThumbnail ? Buffer.from(imageMessage.jpegThumbnail) : undefined,
            highQualityThumbnail: imageMessage || undefined
          },
          contextInfo
        },
        { quoted: msg }
      );
    } catch {}
  }

  return sock.sendMessage(msg.chat, { text: trimmed, contextInfo }, { quoted: msg });
}

export default {
  command: ['help', 'ayuda', 'menu', 'menú', 'comandos', 'commands', 'allmenu'],
  category: 'main',
  description: 'Mostrar el menú de comandos o ayuda específica.',
  run: async ({ msg, sock, args, usedPrefix, command, isOwner }) => {
    try {
      const appSettings = loadSettings();
      const theme = appSettings.menuTheme || 'yuki';
      const menuStyle = appSettings.menuStyle || 'lista';

      const botId = sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
      const botSettings = db.getSettings(botId) || {};
      const botname = botSettings.botname || config.botName || 'Denji bot';
      const namebot = botSettings.namebot || botname.split(' ')[0] || 'Denji';
      const coin = botSettings.currency || appSettings.coin || config.coin || 'Yenes';
      const banner = appSettings.menuBanners?.[theme] || botSettings.banner || appSettings.banner || '';
      const link = botSettings.link || global.links?.channel || global.links?.github || '';
      const owner = botSettings.owner || '';
      const canalId = botSettings.newsletter_id || '';
      const canalName = botSettings.nameid || botname;
      const devName = config.devName || global.dev || 'Lyan';

      const mainJid = global.sock?.user?.id ? `${global.sock.user.id.split('@')[0].split(':')[0]}@s.whatsapp.net` : botId;
      const botType = botId === mainJid ? 'Principal' : 'Sub-Bot';

      const userRec = db.getUser(msg.sender);
      const userName = userRec?.name || msg.pushName || msg.sender.split('@')[0];
      const prefix = usedPrefix || config.prefix || '.';
      const uptime = formatUptime(sock.uptime ? (Date.now() - sock.uptime) / 1000 : process.uptime());
      const device = msg.key?.id ? getDevice(msg.key.id) : 'unknown';
      const now = new Date();
      const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).replace('.', '');
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      const allCategories = buildCatalog(prefix);
      const visibleCategories = isOwner ? allCategories : allCategories.filter(c => c.id !== 'owner');
      const totalCommands = visibleCategories.reduce((sum, c) => sum + (c.count ?? c.commands.length), 0);

      const menuData = {
        botName: botname,
        shortName: namebot,
        devName,
        coin,
        prefix,
        user: userName,
        userTag: `@${msg.sender.split('@')[0]}`,
        total: totalCommands,
        link,
        botType,
        device,
        date: dateStr,
        time: timeStr,
        users: typeof db.countUsers === 'function' ? db.countUsers() : (db.getUser()?.length || 0),
        uptime
      };

      const sendMeta = {
        banner,
        link,
        botname,
        namebot,
        devName,
        canalId,
        canalName,
        mentions: [owner, msg.sender]
      };

      const rawArg = args.join(' ').trim();
      const stripped = rawArg.startsWith(prefix) ? rawArg.slice(prefix.length) : rawArg;
      const query = cleanStr(stripped);

      // 1) Menú completo: .allmenu | .menu todo | .menu all | .menu completo
      const wantsAll =
        command === 'allmenu' ||
        ['all', 'todo', 'todos', 'completo', 'full', 'allmenu'].includes(query);

      if (wantsAll) {
        const compactCats = collapseGroupsForFullMenu(visibleCategories, prefix);
        return sendStyledMenu(sock, msg, renderMenu(theme, menuData, compactCats), sendMeta);
      }

      // 2) Índice por categorías: .menu categorias | .menu index
      if (['categorias', 'categoria', 'secciones', 'index', 'indice'].includes(query)) {
        return sendStyledMenu(sock, msg, renderIndex(theme, menuData, visibleCategories), sendMeta);
      }

      // 3) Categoría concreta o ficha de un comando concreto
      if (query) {
        const matchedCat = allCategories.find(
          c => c.id === query || cleanStr(c.label) === query || c.aliases.includes(query)
        );
        if (matchedCat) {
          return sendStyledMenu(sock, msg, renderCategory(theme, menuData, matchedCat), sendMeta);
        }

        const cmdEntry = global.comandos?.get(stripped.toLowerCase()) || global.comandos?.get(query);
        if (cmdEntry) {
          const catLabel = CATEGORIES.find(c => c.id === cmdEntry.category)?.label || cmdEntry.category || 'General';
          const primary = cmdEntry.aliases?.[0] || query;
          const orderedAliases = [
            query,
            ...(cmdEntry.aliases || []).filter(a => a !== query)
          ].slice(0, 10);
          const card = renderCommandHelp(theme, menuData, {
            cmd: orderedAliases,
            desc: cmdEntry.description || 'Sin descripción disponible.',
            usage: USAGE_HINTS[query] || USAGE_HINTS[primary] || '',
            admin: Boolean(cmdEntry.isAdmin),
            categoryLabel: catLabel
          });
          return sendStyledMenu(sock, msg, card, { ...sendMeta, banner: '' });
        }

        return msg.reply(
          `《✧》 La categoría o comando *${stripped}* no existe.\n` +
          `> Usa *${prefix}menu* para ver las categorías disponibles.`
        );
      }

      // 4) Sin argumentos: respetar el formato elegido (lista | categorias | texto)
      if (menuStyle === 'lista' && device !== 'desktop' && device !== 'web') {
        try {
          const lt = listTexts(theme, menuData);
          const rows = visibleCategories.map(cat => ({
            title: lt.rowTitle(cat),
            description: `${cat.subtitle} (${cat.count})`,
            id: `${prefix}menu ${cat.id}`
          }));
          rows.push({
            title: lt.fullRowTitle,
            description: `Lista plegable con los ${totalCommands} comandos`,
            id: `${prefix}menu todo`
          });
          let imageHeader;
          if (banner && !/\.(mp4|webm|gif)(\?.*)?$/i.test(banner)) {
            if (/^https?:\/\//i.test(banner)) {
              imageHeader = banner;
            } else {
              const p = path.isAbsolute(banner) ? banner : path.join(ROOT, banner);
              if (fs.existsSync(p)) imageHeader = fs.readFileSync(p);
            }
          }
          await sendList(
            sock,
            msg.chat,
            {
              text: lt.text,
              footer: `${namebot} · ${prefix}menu <categoría>`,
              buttonText: lt.buttonText,
              image: imageHeader,
              sections: [{ title: lt.sectionTitle, rows }]
            },
            msg
          );
          return;
        } catch {
          // Si falla la lista interactiva, mostramos el resumen limpio por categorías.
        }
      }

      if (menuStyle === 'texto') {
        const compactCats = collapseGroupsForFullMenu(visibleCategories, prefix);
        return sendStyledMenu(sock, msg, renderMenu(theme, menuData, compactCats), sendMeta);
      }

      return sendStyledMenu(sock, msg, renderIndex(theme, menuData, visibleCategories), sendMeta);
    } catch (e) {
      await msg.reply(
        `> Ocurrió un error al mostrar el menú *${usedPrefix + command}*.\n> [Error: *${e.message}*]`
      );
    }
  }
};
