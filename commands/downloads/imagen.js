import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const NSFW_TERMS = [
  '+18', '18+', 'nsfw', 'xxx', 'pornhub', 'xvideos', 'xnxx', 'redtube', 'brazzers',
  'onlyfans', 'chaturbate', 'spankbang', 'rule34', 'r34', 'porno', 'porn', 'pornstar',
  'sexo', 'desnudo', 'desnuda', 'desnudos', 'desnudas', 'nude', 'nudes', 'nudity',
  'erotico', 'erótico', 'tetas', 'boobs', 'pene', 'vagina', 'masturbacion', 'masturbación',
  'orgia', 'orgía', 'gangbang', 'creampie', 'cumshot', 'milf', 'incesto', 'incest',
  'bdsm', 'hentai', 'ecchi', 'ahegao', 'futanari', 'blowjob', 'handjob', 'deepthroat',
  'pussy', 'dick', 'cock', 'whore', 'slut', 'hardcore', 'sexcam', 'mia khalifa', 'lana rhoades'
];

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NSFW_REGEXES = NSFW_TERMS.map(w => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}([^\\p{L}\\p{N}]|$)`, 'iu'));

function isBlockedQuery(text) {
  return NSFW_REGEXES.some(re => re.test(text));
}

async function fetchJson(url) {
  const { data } = await axios.get(url, {
    timeout: 20_000,
    headers: { 'User-Agent': DEFAULT_UA, Accept: 'application/json' }
  });
  return data;
}

async function getImageSearchResults(query) {
  const enc = encodeURIComponent(query);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';
  const yuki = global.APIs?.yuki;

  const providers = [
    async () => {
      const d = await fetchJson(`${delirius}/search/gimage?query=${enc}`);
      const list = Array.isArray(d?.data) ? d.data : [];
      return list.map(x => ({
        url: x?.url || x?.image,
        title: x?.origin?.title || x?.title || null,
        domain: x?.origin?.website?.domain || null,
        resolution: x?.width && x?.height ? `${x.width}x${x.height}` : null
      }));
    },
    async () => {
      const d = await fetchJson(`${vreden}/api/v1/search/google/image?query=${enc}`);
      const list = Array.isArray(d?.result?.search_data) ? d.result.search_data : Array.isArray(d?.result) ? d.result : [];
      return list.map(x => (typeof x === 'string' ? { url: x } : { url: x?.url || x?.image, title: x?.title || null }));
    },
    async () => {
      if (!yuki?.url) return [];
      const d = await fetchJson(`${yuki.url}/search/googleimage?q=${enc}&key=${yuki.key}`);
      const list = Array.isArray(d?.data) ? d.data : Array.isArray(d?.result) ? d.result : [];
      return list.map(x => (typeof x === 'string' ? { url: x } : { url: x?.url || x?.image, title: x?.title || null }));
    },
    async () => {
      const d = await fetchJson(`https://api.siputzx.my.id/api/images?query=${enc}`);
      const list = Array.isArray(d?.data) ? d.data : [];
      return list.map(x => ({
        url: x?.url || x?.image,
        resolution: x?.width && x?.height ? `${x.width}x${x.height}` : null
      }));
    },
    async () => {
      const d = await fetchJson(`${delirius}/search/pinterestv2?text=${enc}`);
      const list = Array.isArray(d?.data) ? d.data : [];
      return list.map(x => ({ url: x?.image, title: x?.title || null, domain: 'pinterest.com' }));
    }
  ];

  for (const fn of providers) {
    try {
      const res = (await fn()).filter(
        r => r?.url && /^https?:\/\//i.test(r.url) && !/\.svg(\?|$)/i.test(r.url)
      );
      if (res.length) return res;
    } catch {}
  }
  return [];
}

async function isImageAccessible(url) {
  try {
    const res = await axios.head(url, {
      timeout: 5_000,
      maxRedirects: 3,
      headers: { 'User-Agent': DEFAULT_UA },
      validateStatus: s => s >= 200 && s < 400
    });
    const ct = String(res.headers?.['content-type'] || '');
    return !ct || ct.startsWith('image/');
  } catch {
    return false;
  }
}

export default {
  command: ['imagen', 'img', 'image', 'gimage'],
  category: 'downloads',
  description: 'Buscar y descargar imágenes de Google.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const text = args.join(' ').trim();
    if (!text) {
      return sock.reply(msg.chat, '《✧》 Por favor, ingresa un término de búsqueda.', msg);
    }
    if (isBlockedQuery(text)) {
      return msg.reply('《✧》 Este comando no permite búsquedas de contenido *+18* o *NSFW*.');
    }
    try {
      const results = await getImageSearchResults(text);
      if (!results.length) {
        return sock.reply(msg.chat, `《✧》 No se encontraron imágenes para *${text}*.`, msg);
      }
      const candidates = results.slice(0, 14);
      const checks = await Promise.all(candidates.map(async r => ((await isImageAccessible(r.url)) ? r : null)));
      const valid = checks.filter(Boolean);
      const finalList = (valid.length ? valid : candidates).slice(0, 8);

      const medias = finalList.map(r => ({
        type: 'image',
        data: { url: r.url },
        caption:
          `ㅤ۟∩　ׅ　★　ׅ　🅖oogle 🅘mage 🅢earch　ׄᰙ\n\n` +
          (r.title ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Título* › ${String(r.title).slice(0, 180)}\n` : '') +
          (r.domain ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Fuente* › ${r.domain}\n` : '') +
          (r.resolution ? `𖣣ֶㅤ֯⌗ ☆  ⬭ *Resolución* › ${r.resolution}\n` : '') +
          `𖣣ֶㅤ֯⌗ ☆  ⬭ *Búsqueda* › ${text}`
      }));

      await sock.sendAlbumMessage(msg.chat, medias, { quoted: msg });
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
