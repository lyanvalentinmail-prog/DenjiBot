import { exec } from 'node:child_process';
import cmdsLoader from '#loader';

export default {
  command: ['fix', 'update'],
  category: 'owner',
  description: 'Actualizar y recargar los comandos del bot.',
  isOwner: true,
  run: async ({ msg, sock }) => {
    exec('git pull', async (error, stdout = '', stderr = '') => {
      await cmdsLoader(false);
      let replyMsg = '';
      if (stdout.includes('Already up to date.')) {
        replyMsg = 'ꕥ *Estado:* Todo está actualizado y los comandos fueron recargados.';
      } else if (error) {
        replyMsg = `ꕥ *Comandos recargados.*\n> Git: ${error.message || stderr}`;
      } else {
        replyMsg = `✿ *Actualización completada*\n\n${stdout.trim()}`;
      }
      await sock.sendMessage(msg.key.remoteJid, { text: replyMsg }, { quoted: msg });
    });
  }
};
