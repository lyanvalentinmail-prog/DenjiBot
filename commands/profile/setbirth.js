import db from '#db';

const MONTHS = {
  ene: 1, enero: 1, jan: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4, apr: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8, aug: 8,
  sep: 9, sept: 9, septiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12, dec: 12
};

export default {
  command: ['setbirth'],
  category: 'profile',
  description: 'Establecer tu fecha de cumpleaños.',
  run: async ({ msg, args, usedPrefix, command }) => {
    const currentYear = new Date().getFullYear();
    const input = args.join(' ').trim();
    if (!input) {
      return msg.reply(
        `《✧》 Debes ingresar una fecha válida para tu cumpleaños.\n✐ Ejemplos:\n` +
        `> ${usedPrefix + command} *01/01/2000* (día/mes/año)\n` +
        `> ${usedPrefix + command} *01/01* (día/mes)`
      );
    }
    const birth = validarFechaNacimiento(input, currentYear, usedPrefix, command);
    if (typeof birth === 'string' && birth.startsWith('✦')) return msg.reply(birth);
    if (!birth) return msg.reply(`《✧》 Fecha inválida. Usa › *${usedPrefix + command} 01/01/2000*`);
    db.setUser(msg.sender, 'birth', birth);
    return msg.reply(`✎ Se ha establecido tu fecha de nacimiento como: *${birth}*`);
  }
};

function validarFechaNacimiento(text, currentYear, usedPrefix, command) {
  const s = String(text || '').trim().toLowerCase();
  let day = 0;
  let month = 0;
  let year = currentYear;

  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?$/);
  const wordMatch = !slashMatch && s.match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)\.?(?:\s+(?:de\s+)?(\d{4}))?$/i);

  if (slashMatch) {
    day = parseInt(slashMatch[1], 10);
    month = parseInt(slashMatch[2], 10);
    if (slashMatch[3]) year = parseInt(slashMatch[3], 10);
  } else if (wordMatch) {
    day = parseInt(wordMatch[1], 10);
    month = MONTHS[wordMatch[2].replace(/\.$/, '')] || 0;
    if (wordMatch[3]) year = parseInt(wordMatch[3], 10);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year > currentYear) {
    return `✦ El año no puede ser mayor a ${currentYear}. Ejemplo: ${usedPrefix + command} 01/12/${currentYear}`;
  }
  if (currentYear - year > 120) {
    return '✦ La fecha establecida es inválida.';
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  const diaSemana = date.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' });
  const mes = date.toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' });
  return `${diaSemana}, ${day} de ${mes} de ${year}`;
}
