import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const REPO_REGEX = /^(?:https?:\/\/|git@)github\.com[:/]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i;
const GH_HEADERS = {
  'User-Agent': DEFAULT_UA,
  Accept: 'application/vnd.github+json'
};

function formatDate(raw) {
  if (!raw) return 'Desconocida';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString('es-ES');
}

function formatRepo(repo, idx = null) {
  const prefix = idx != null ? `*${idx}.* ` : '';
  return (
    `${prefix}✿ *Repositorio ›* ${repo.full_name || repo.name}\n` +
    (repo.description ? `> ❖ *Descripción ›* ${repo.description}\n` : '') +
    `> ☆ *Estrellas ›* ${repo.stargazers_count ?? 0} · *Forks ›* ${repo.forks_count ?? 0}\n` +
    (repo.language ? `> ✐ *Lenguaje ›* ${repo.language}\n` : '') +
    `> ⴵ *Actualizado ›* ${formatDate(repo.updated_at)}\n` +
    `> ❒ *Enlace ›* ${repo.html_url}`
  );
}

export default {
  command: ['gitclone', 'git', 'github'],
  category: 'utils',
  description: 'Buscar y descargar un repositorio de GitHub.',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    const query = String(text || '').trim();
    if (!query) {
      return sock.reply(msg.chat, '《✧》 Por favor, ingresa el enlace o nombre de un repositorio de GitHub.', msg);
    }
    try {
      const match = query.match(REPO_REGEX);
      if (match) {
        const [, owner, repo] = match;
        const { data: repoData } = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
          timeout: 15_000,
          headers: GH_HEADERS
        });
        const zipRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/zipball`, {
          responseType: 'arraybuffer',
          timeout: 45_000,
          maxRedirects: 5,
          headers: GH_HEADERS
        });
        const disp = String(zipRes.headers?.['content-disposition'] || '');
        const fileName = disp.match(/filename="?([^";]+)"?/i)?.[1] || `${repo}-${owner}.zip`;
        await sock.sendMessage(
          msg.chat,
          {
            document: Buffer.from(zipRes.data),
            fileName,
            mimetype: 'application/zip',
            caption: formatRepo(repoData)
          },
          { quoted: msg }
        );
        return;
      }

      const { data } = await axios.get(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=8`,
        { timeout: 15_000, headers: GH_HEADERS }
      );
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        return sock.reply(msg.chat, `《✧》 No se encontraron repositorios para *${query}*.`, msg);
      }
      const caption =
        `ㅤ۟∩　ׅ　★　ׅ　🅖𝗂𝗍𝖧𝗎𝖻 🅢earch　ׄᰙ\n\n` +
        items.slice(0, 6).map((r, i) => formatRepo(r, i + 1)).join('\n\n') +
        `\n\n> Usa *${usedPrefix + command} <enlace>* para descargar el ZIP.`;
      const avatar = items[0]?.owner?.avatar_url;
      if (avatar) {
        await sock.sendMessage(msg.chat, { image: { url: avatar }, caption }, { quoted: msg })
          .catch(() => msg.reply(caption));
      } else {
        await msg.reply(caption);
      }
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) {
        return sock.reply(msg.chat, '《✧》 Repositorio no encontrado o privado.', msg);
      }
      await sock.reply(msg.chat, `> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`, msg);
    }
  }
};
