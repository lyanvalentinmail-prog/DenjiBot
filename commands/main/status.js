import os from 'os';
import db from '#db';

function getDefaultHostId() {
  if (process.env.HOSTNAME) {
    return process.env.HOSTNAME.split('-')[0];
  }
  return 'Default_host_id';
}

function format(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const val = parseFloat((n / Math.pow(1024, i)).toFixed(2));
  return `${val} ${units[i]}`;
}

export default {
  command: ['status', 'estado'],
  category: 'main',
  description: 'Ver el estado del bot.',
  run: async ({ msg, sock }) => {
    const hostId = getDefaultHostId();
    const allChats = db.getChat();
    const registeredGroups = allChats?.length || 0;
    const botId = sock.user.id.split('@')[0].split(':')[0] + "@s.whatsapp.net" || false;
    const botSettings = db.getSettings(botId) || {};
    const botname = botSettings.botname || 'Bot';
    const allUsers = db.getUser();
    const userCount = allUsers?.length || '0';
    const totalCommands = allUsers?.reduce((acc, user) => acc + (user.usedcommands || 0), 0) || 0;
    const estadoBot = `「❀」 Estado de *${botname}* (●\´ϖ\`●)
◇ *Usuarios registrados ›* ${userCount.toLocaleString()}
◇ *Grupos registrados ›* ${registeredGroups.toLocaleString()}
◇ *Comandos ejecutados ›* ${toNum(totalCommands)}`;
    const sistema = os.type();
    const cpu = os.cpus().length || (typeof os.availableParallelism === 'function' ? os.availableParallelism() : 1);
    const ramTotal = format(os.totalmem());
    const ramUsada = format(os.totalmem() - os.freemem());
    const arquitectura = os.arch();
    const estadoServidor = `➭ Estado del Servidor *₍ᐢ..ᐢ₎♡*

❖ *Sistema ›* ${sistema}
❖ *CPU ›* ${cpu} cores
❖ *RAM ›* ${ramTotal}
❖ *RAM Usado ›* ${ramUsada}
❖ *Arquitectura ›* ${arquitectura}
❖ *Host ID ›* ${hostId}

*❑ Uso de Memoria NODEJS*
◆ *Ram Utilizada* › ${format(process.memoryUsage().rss)}
◆ *Heap Reservado* › ${format(process.memoryUsage().heapTotal)}
◆ *Heap Usado* › ${format(process.memoryUsage().heapUsed)}
◆ *Módulos Nativos* › ${format(process.memoryUsage().external)}
◆ *Buffers de Datos* › ${format(process.memoryUsage().arrayBuffers)}`;    
    const mensajeEstado = `${estadoBot}\n\n${estadoServidor}`;
    await sock.sendMessage(msg.chat, { text: mensajeEstado, mentions: [msg.sender] }, { quoted: msg });
  }
};

function toNum(number) {
  if (number >= 1000 && number < 1000000) {
    return (number / 1000).toFixed(1) + 'k';
  } else if (number >= 1000000) {
    return (number / 1000000).toFixed(1) + 'M';
  } else {
    return number.toString();
  }
}