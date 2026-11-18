import axios from 'axios';

async function searchAptoide(query) {
  const url = `https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=10`;
  const { data } = await axios.get(url, { timeout: 20_000 });
  const list = data?.datalist?.list;
  if (!Array.isArray(list) || !list.length) return [];
  return list.map(app => {
    const bytes = Number(app?.size || app?.file?.filesize || 0);
    const dllink = app?.file?.path || app?.file?.path_alt || '';
    return {
      name: app?.name || query,
      id: app?.package || app?.uname || '',
      package: app?.package || '',
      size: formatBytes(bytes),
      sizeBytes: bytes,
      icon: app?.icon || '',
      dllink,
      lastup: app?.updated || app?.modified || 'Desconocido'
    };
  }).filter(a => a.dllink);
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 MB';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

export default {
  command: ['apk', 'aptoide', 'apkdl'],
  category: 'downloads',
  description: 'Buscar y descargar aplicaciones de Aptoide.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    if (!args || !args.length) {
      return msg.reply('《✧》 Por favor, ingresa el nombre de la aplicación.');
    }
    const query = args.join(' ').trim();
    try {
      const results = await searchAptoide(query);
      if (!results.length) {
        return msg.reply('《✧》 No se encontraron resultados.');
      }
      const { name, package: id, size, sizeBytes, dllink: downloadUrl, lastup } = results[0];
      const caption = `✰ ᩧ　𓈒　ׄ　Aptoide 　ׅ　✿\n\n➩ *Nombre ›* ${name}\n❖ *Paquete ›* ${id}\n✿ *Última actualización ›* ${lastup}\n☆ *Tamaño ›* ${size}`;
      if (sizeBytes > 524288000) {
        return msg.reply(`《✧》 El archivo es demasiado grande (${size}).\n> Descárgalo directamente desde aquí:\n${downloadUrl}`);
      }
      await sock.sendMessage(
        msg.chat,
        {
          document: { url: downloadUrl },
          mimetype: 'application/vnd.android.package-archive',
          fileName: `${name}.apk`,
          caption
        },
        { quoted: msg }
      );
    } catch (e) {
      await msg.reply(`> Ocurrió un error inesperado al ejecutar el comando *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
