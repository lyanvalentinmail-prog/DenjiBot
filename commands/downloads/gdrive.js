import axios from 'axios';
import { DEFAULT_UA } from '#simple';

function extractDriveId(url = '') {
  return (
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i)?.[1] ||
    url.match(/\/d\/([a-zA-Z0-9_-]+)/i)?.[1] ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/i)?.[1] ||
    null
  );
}

function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return 'Desconocido';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${n} B`;
}

async function resolveGDrive(url, id) {
  const enc = encodeURIComponent(url);
  const delirius = global.APIs?.delirius?.url || 'https://api.delirius.online';
  const vreden = global.APIs?.vreden?.url || 'https://api.vreden.web.id';

  const providers = [
    // 1. API JSON directa de Google Drive
    async () => {
      const res = await fetch(`https://drive.google.com/uc?id=${id}&authuser=0&export=download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Origin: 'https://drive.google.com',
          'User-Agent': DEFAULT_UA,
          'x-drive-first-party': 'DriveWebUi',
          'x-json-requested': 'true'
        },
        signal: AbortSignal.timeout(20_000)
      });
      const raw = await res.text();
      const json = JSON.parse(raw.replace(/^\)\]\}'\s*/, ''));
      if (!json?.downloadUrl) return null;
      const head = await axios.head(json.downloadUrl, { timeout: 10_000, maxRedirects: 5 }).catch(() => null);
      return {
        downloadUrl: json.downloadUrl,
        fileName: json.fileName || `${id}.bin`,
        fileSize: formatSize(json.sizeBytes),
        mimetype: head?.headers?.['content-type'] || 'application/octet-stream'
      };
    },
    // 2. Endpoint usercontent directo de Google Drive (confirm=t)
    async () => {
      const directUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
      const head = await axios.head(directUrl, {
        timeout: 15_000,
        maxRedirects: 5,
        headers: { 'User-Agent': DEFAULT_UA }
      });
      const ct = String(head.headers?.['content-type'] || '');
      if (ct.includes('text/html')) return null;
      const disp = String(head.headers?.['content-disposition'] || '');
      const utf8Name = disp.match(/filename\*=UTF-8''([^;\s]+)/i)?.[1];
      const plainName = disp.match(/filename="?([^";]+)"?/i)?.[1];
      const fileName = utf8Name ? decodeURIComponent(utf8Name) : plainName || `${id}.bin`;
      return {
        downloadUrl: directUrl,
        fileName,
        fileSize: formatSize(head.headers?.['content-length']),
        mimetype: ct || 'application/octet-stream'
      };
    },
    // 3. Delirius / Vreden / Siputzx
    async () => {
      const { data } = await axios.get(`${delirius}/download/gdrive?url=${enc}`, { timeout: 20_000 });
      const d = data?.data;
      if (!d?.downloadUrl && !d?.download) return null;
      return {
        downloadUrl: d.downloadUrl || d.download,
        fileName: d.fileName || d.name || `${id}.bin`,
        fileSize: d.fileSize || d.size || 'Desconocido',
        mimetype: d.mimetype || 'application/octet-stream'
      };
    },
    async () => {
      const { data } = await axios.get(`${vreden}/api/v1/download/gdrive?url=${enc}`, { timeout: 20_000 });
      const d = data?.result;
      if (!d?.downloadUrl && !d?.download) return null;
      return {
        downloadUrl: d.downloadUrl || d.download,
        fileName: d.fileName || `${id}.bin`,
        fileSize: d.fileSize || 'Desconocido',
        mimetype: d.mimetype || 'application/octet-stream'
      };
    },
    async () => {
      const { data } = await axios.get(`https://api.siputzx.my.id/api/d/gdrive?url=${enc}`, { timeout: 20_000 });
      const d = data?.data;
      if (!d?.download) return null;
      return {
        downloadUrl: d.download,
        fileName: d.name || `${id}.bin`,
        fileSize: d.fileSize || 'Desconocido',
        mimetype: d.mimetype || 'application/octet-stream'
      };
    }
  ];

  for (const fn of providers) {
    try {
      const out = await fn();
      if (out?.downloadUrl) return out;
    } catch {}
  }
  return null;
}

export default {
  command: ['drive', 'gdrive', 'gdrivedl'],
  category: 'downloads',
  description: 'Descargar un archivo público de Google Drive.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const url = args[0]?.trim();
    if (!url) {
      return msg.reply('《✧》 Por favor, ingresa un enlace de Google Drive.');
    }
    const id = /drive\.google\.com/i.test(url) ? extractDriveId(url) : null;
    if (!id) {
      return msg.reply('《✧》 La URL no parece un archivo válido de Google Drive.');
    }
    try {
      const data = await resolveGDrive(url, id);
      if (!data) {
        return msg.reply('《✧》 No se pudo obtener el archivo. Verifica que el acceso sea público.');
      }
      const caption =
        `۟　ꕥ ᩧ　𓈒　ׄ　𝖦oogle 𝖣𝗋𝗂𝗏𝖾　ׅ　✿۟\n\n` +
        ` ׄ ﹙ׅ☆﹚ּ *Nombre* › ${data.fileName}\n` +
        ` ׄ ﹙ׅ☆﹚ּ *Tamaño* › ${data.fileSize}\n` +
        ` ׄ ﹙ׅ☆﹚ּ *Tipo* › ${data.mimetype}\n\n` +
        `𖣣ֶㅤ֯⌗ ☆  ⬭ *Enlace* › ${url}`;
      await sock.sendMessage(
        msg.chat,
        { document: { url: data.downloadUrl }, mimetype: data.mimetype, fileName: data.fileName, caption },
        { quoted: msg }
      );
    } catch (e) {
      return msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
