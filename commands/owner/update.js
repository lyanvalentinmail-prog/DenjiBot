import { exec } from 'node:child_process';
import cmdsLoader from '#loader';
import { ROOT } from '#settings';

export default {
  command: ['fix', 'update'],
  category: 'owner',
  description: 'Actualizar y recargar los comandos del bot.',
  isOwner: true,
  run: async ({ msg, sock, usedPrefix }) => {
    exec('git pull', { cwd: ROOT, timeout: 60_000 }, async (error, stdout = '', stderr = '') => {
      await cmdsLoader(false);
      const out = String(stdout || '').trim();
      let replyMsg = '';
      if (/Already up to date|Ya está actualizado/i.test(out)) {
        replyMsg = 'ꕥ *Estado:* Todo está actualizado y los comandos fueron recargados.';
      } else if (error) {
        replyMsg = `ꕥ *Comandos recargados.*\n> Git: ${error.message || stderr}`;
      } else {
        const needsRestart = /\.(ts|json)\b/.test(out);
        replyMsg =
          `✿ *Actualización completada*\n\n${out}` +
          (needsRestart ? `\n\n> Usa *${usedPrefix}restart* para aplicar los cambios del núcleo.` : '');
      }
      await sock.sendMessage(msg.chat, { text: replyMsg }, { quoted: msg });
    });
  }
};
