import axios from 'axios';

const WIKI_HEADERS = {
  'User-Agent': 'DenjiBot/1.0 (https://github.com/lyanvalentinmail-prog/DenjiBot)',
  Accept: 'application/json'
};

async function searchWikipedia(query, lang = 'es') {
  const searchUrl =
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(query)}&srlimit=3&utf8=1&format=json`;

  const { data } = await axios.get(searchUrl, { headers: WIKI_HEADERS, timeout: 15_000 });
  const hits = data?.query?.search;
  if (!Array.isArray(hits) || !hits.length) return null;

  const title = hits[0].title;
  const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const { data: sum } = await axios.get(summaryUrl, { headers: WIKI_HEADERS, timeout: 15_000 });

  return {
    title: sum?.title || title,
    description: sum?.description || '',
    extract: sum?.extract || String(hits[0].snippet || '').replace(/<[^>]+>/g, ''),
    url: sum?.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    image: sum?.thumbnail?.source || sum?.originalimage?.source || '',
    related: hits.slice(1).map(h => h.title)
  };
}

export default {
  command: ['wikipedia', 'wiki'],
  category: 'utils',
  description: 'Buscar información y resúmenes en Wikipedia.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return msg.reply(
        `《✧》 Escribe el tema que deseas buscar en Wikipedia.\n` +
        `> Ejemplo: *${usedPrefix + command} Chainsaw Man*`
      );
    }

    try {
      const article =
        (await searchWikipedia(query, 'es').catch(() => null)) ||
        (await searchWikipedia(query, 'en').catch(() => null));

      if (!article?.extract) {
        return msg.reply(`《✧》 No se encontraron artículos en Wikipedia para *${query}*.`);
      }

      const extract = article.extract.length > 1600
        ? article.extract.slice(0, 1597).trimEnd() + '…'
        : article.extract;

      const caption =
        `✿ *Wikipedia — ${article.title}*\n` +
        (article.description ? `> _${article.description}_\n` : '') +
        `\n${extract}\n\n` +
        (article.related?.length ? `> ❀ *Relacionados ::* ${article.related.join(' · ')}\n` : '') +
        `> ✎ ${article.url}`;

      if (article.image && /^https?:\/\//i.test(article.image)) {
        return await sock.sendMessage(msg.chat, { image: { url: article.image }, caption }, { quoted: msg })
          .catch(() => msg.reply(caption));
      }
      await msg.reply(caption);
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
