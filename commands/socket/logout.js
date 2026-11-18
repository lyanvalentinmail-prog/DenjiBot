import fs from 'fs';
import path from 'path';
import { jidDecode } from '@whiskeysockets/baileys';
import db from '#db';
import { SUBS_DIR } from '#settings';

export default {
  command: ['logout'],
  category: 'socket',
  description: 'Cerrar sesión del bot.',
  run: async ({ msg, sock, usedPrefix, command, isROwner }) => {
    const idBot = sock.user.id.split('@')[0].split(':')[0] + '@s.whatsapp.net';
    const config = db.getSettings(idBot) || {};
    const isOwner2 = isROwner || [idBot, ...(config.owner ? [config.owner] : []), ...global.owner.map(num => num + '@s.whatsapp.net')].includes(msg.sender);
    if (!isOwner2) return sock.reply(msg.chat, global.mess.socket, msg);
    const rawId = sock.user?.id || '';
    const decoded = jidDecode(rawId);
    const cleanId = decoded?.user || rawId.split('@')[0].split(':')[0];
    const sessionPath = path.join(SUBS_DIR, cleanId);
    if (!fs.existsSync(sessionPath)) return msg.reply('《✧》 Este comando solo puede ser usado desde una instancia de Sub-Bot.');
    try {
      await msg.reply('《✧》 Cerrando sesión del Socket...');
      await sock.logout();
      setTimeout(() => {
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          console.log(`《✧》 Sesión de ${cleanId} eliminada de ${sessionPath}`);
        }
      }, 2000);
      setTimeout(() => {
        msg.reply(`《✧》 Sesión finalizada correctamente.\nPuedes reconectarte usando *${usedPrefix}code*`);
      }, 3000);
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  },
};