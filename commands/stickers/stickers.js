import axios from 'axios';
import db from '#db';

const STICKERLY_UA = 'androidapp.stickerly/3.17.0 (Pixel 8; U; Android 14; es-ES; es;)';

async function searchStickerLyDirect(query) {
  const { data } = await axios.post(
    'https://api.sticker.ly/v4/stickerPack/smartSearch',
    { keyword: query, enabledKeywordSearch: true, filter: { extendSearchResult: false, sortBy: 'RECOMMENDED', languages: ['ALL'], minStickerCount: 5, searchBy: 'ALL', stickerType: 'ALL' } },
    { timeout: 15_000, headers: { 'User-Agent': STICKERLY_UA, 'Content-Type': 'application/json' } }
  );
  const packs = data?.result?.stickerPacks;
  if (!Array.isArray(packs) || !packs.length) return [];
  return packs
    .filter(p => !p.nsfw && Array.isArray(p.resourceFiles) && p.resourceFiles.length && p.resourceUrlPrefix)
    .map(p => ({
      name: p.name || query,
      author: p.authorName || 'Sticker.ly',
      isAnimated: Boolean(p.animated),
      stickers: p.resourceFiles.map(f => ({
        imageUrl: `${p.resourceUrlPrefix}${f}`,
        isAnimated: Boolean(p.animated)
      }))
    }));
}

async function detailStickerLyDirect(code) {
  const { data } = await axios.get(`https://api.sticker.ly/v4/stickerPack/${encodeURIComponent(code)}?needRelation=false`, {
    timeout: 15_000,
    headers: { 'User-Agent': STICKERLY_UA }
  });
  const p = data?.result;
  if (!p || !Array.isArray(p.stickers) || !p.stickers.length) return null;
  const prefix = p.resourceUrlPrefix || '';
  return {
    name: p.name || 'Stickers',
    author: p.user?.displayName || p.user?.userName || 'Sticker.ly',
    stickers: p.stickers
      .map(s => ({
        imageUrl: s.fileName ? `${prefix}${s.fileName}` : s.resourceUrl,
        isAnimated: Boolean(s.isAnimated ?? p.isAnimated)
      }))
      .filter(s => s.imageUrl)
  };
}

async function getPackFromUrl(url, code) {
  if (code) {
    try {
      const direct = await detailStickerLyDirect(code);
      if (direct?.stickers?.length) return direct;
    } catch {}
  }
  const yuki = global.APIs?.yuki;
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const fallbacks = [
    async () => {
      const { data } = await axios.get(`${delirius}/download/stickerly?url=${encodeURIComponent(url)}`, { timeout: 15_000 });
      const d = data?.data;
      if (!Array.isArray(d?.stickers) || !d.stickers.length) return null;
      return {
        name: d.name || 'Stickers',
        author: d.author || d.username || 'Sticker.ly',
        stickers: d.stickers.map(u => ({ imageUrl: typeof u === 'string' ? u : u?.url, isAnimated: false })).filter(s => s.imageUrl)
      };
    },
    async () => {
      if (!yuki?.url) return null;
      const { data } = await axios.get(`${yuki.url}/stickerly/detail`, { params: { url, key: yuki.key }, timeout: 15_000 });
      const d = data?.detalles;
      if (!d?.stickers?.length) return null;
      return {
        name: d.name || 'Stickers',
        author: d.author?.name || d.author?.username || 'Sticker.ly',
        stickers: d.stickers.filter(s => s?.imageUrl)
      };
    }
  ];
  for (const fn of fallbacks) {
    try {
      const out = await fn();
      if (out?.stickers?.length) return out;
    } catch {}
  }
  return null;
}

async function getPackFromSearch(query) {
  try {
    const packs = await searchStickerLyDirect(query);
    if (packs.length) {
      return packs[Math.floor(Math.random() * Math.min(packs.length, 6))];
    }
  } catch {}

  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const yuki = global.APIs?.yuki;

  try {
    const { data } = await axios.get(`${delirius}/search/stickerly?query=${encodeURIComponent(query)}`, { timeout: 15_000 });
    const list = Array.isArray(data?.data) ? data.data : [];
    if (list.length) {
      const pick = list[Math.floor(Math.random() * Math.min(list.length, 5))];
      const code = String(pick?.url || '').match(/sticker\.ly\/s\/([a-zA-Z0-9]+)/i)?.[1];
      const detail = await getPackFromUrl(pick.url, code);
      if (detail?.stickers?.length) return detail;
    }
  } catch {}

  if (yuki?.url) {
    try {
      const { data } = await axios.get(`${yuki.url}/stickerly/search`, { params: { query, key: yuki.key }, timeout: 15_000 });
      const list = Array.isArray(data?.resultados) ? data.resultados : [];
      for (const item of list.slice(0, 4)) {
        const code = String(item?.url || '').match(/sticker\.ly\/s\/([a-zA-Z0-9]+)/i)?.[1];
        const detail = await getPackFromUrl(item.url, code);
        if (detail?.stickers?.length) return detail;
      }
    } catch {}
  }
  return null;
}

export default {
  command: ['stickerpack', 'spack', 'stickers', 'ssearch'],
  category: 'stickers',
  description: 'Buscar y descargar packs de stickers.',
  run: async ({ msg, sock, text, usedPrefix, command }) => {
    try {
      const query = String(text || '').trim();
      if (!query) {
        return sock.reply(msg.chat, '《✧》 Ingresa un texto para buscar packs de stickers o una URL de sticker.ly.', msg);
      }
      const name = db.getUser(msg.sender)?.name || msg.pushName || msg.sender.split('@')[0];
      const stickerMatch = query.match(/sticker\.ly\/s\/([a-zA-Z0-9]+)/i);
      const packData = stickerMatch
        ? await getPackFromUrl(`https://sticker.ly/s/${stickerMatch[1]}`, stickerMatch[1])
        : await getPackFromSearch(query);

      if (!packData?.stickers?.length) {
        return sock.reply(msg.chat, `《✧》 No se encontraron packs de stickers para *${query}*.`, msg);
      }

      const stickerResults = packData.stickers.slice(0, 30).map(s => ({
        url: s.imageUrl,
        isAnimated: Boolean(s.isAnimated),
        isLottie: false,
        emojis: ['🎭']
      }));

      try {
        await sock.sendStickerPackMessage(
          msg.chat,
          {
            name: packData.name || query,
            publisher: packData.author || `@${name}`,
            description: global.botName || 'Denji bot',
            stickers: stickerResults
          },
          msg
        );
      } catch {
        // Respaldo: enviar los primeros 5 stickers individualmente si falla el paquete nativo.
        for (const s of stickerResults.slice(0, 5)) {
          await sock.sendImageAsSticker(msg.chat, s.url, msg, {
            packname: packData.name || query,
            author: packData.author || `@${name}`
          }).catch(() => {});
        }
      }
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
