import axios from 'axios';
import { DEFAULT_UA } from '#simple';

const WMO_CODES = {
  0: ['☀️', 'Despejado'],
  1: ['🌤️', 'Mayormente despejado'],
  2: ['⛅', 'Parcialmente nublado'],
  3: ['☁️', 'Nublado'],
  45: ['🌫️', 'Niebla'],
  48: ['🌫️', 'Niebla helada'],
  51: ['🌦️', 'Llovizna ligera'],
  53: ['🌦️', 'Llovizna moderada'],
  55: ['🌧️', 'Llovizna intensa'],
  61: ['🌧️', 'Lluvia ligera'],
  63: ['🌧️', 'Lluvia moderada'],
  65: ['🌧️', 'Lluvia fuerte'],
  71: ['🌨️', 'Nevada ligera'],
  73: ['🌨️', 'Nevada moderada'],
  75: ['❄️', 'Nevada intensa'],
  80: ['🌦️', 'Chubascos ligeros'],
  81: ['🌧️', 'Chubascos moderados'],
  82: ['⛈️', 'Chubascos fuertes'],
  95: ['⛈️', 'Tormenta eléctrica'],
  96: ['⛈️', 'Tormenta con granizo'],
  99: ['⛈️', 'Tormenta fuerte con granizo']
};

export default {
  command: ['clima', 'weather', 'tiempo'],
  category: 'utils',
  description: 'Consultar el clima actual y pronóstico de una ciudad.',
  run: async ({ msg, args, usedPrefix, command }) => {
    const city = args.join(' ').trim();
    if (!city) {
      return msg.reply(
        `《✧》 Escribe el nombre de una ciudad o país.\n` +
        `> Ejemplo: *${usedPrefix + command} Montevideo*`
      );
    }

    try {
      const geoUrl =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}` +
        `&count=1&language=es&format=json`;
      const { data: geo } = await axios.get(geoUrl, {
        timeout: 15_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });

      const place = geo?.results?.[0];
      if (!place) {
        return msg.reply(`《✧》 No se encontró la ubicación *${city}*.`);
      }

      const wxUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&forecast_days=1`;

      const { data: wx } = await axios.get(wxUrl, {
        timeout: 15_000,
        headers: { 'User-Agent': DEFAULT_UA }
      });

      const cur = wx?.current;
      if (!cur) {
        return msg.reply('《✧》 No se pudieron obtener los datos meteorológicos.');
      }

      const [icon, desc] = WMO_CODES[cur.weather_code] || ['🌡️', 'Condición variable'];
      const loc = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
      const tMax = wx?.daily?.temperature_2m_max?.[0];
      const tMin = wx?.daily?.temperature_2m_min?.[0];
      const rainProb = wx?.daily?.precipitation_probability_max?.[0];

      const lines = [
        `${icon} *Clima en ${loc}*`,
        `> _${desc}_`,
        '',
        `│🌡️ *Temperatura ::* ${cur.temperature_2m}°C _(sensación ${cur.apparent_temperature}°C)_`,
        tMin != null && tMax != null ? `│📊 *Mín / Máx hoy ::* ${tMin}°C / ${tMax}°C` : '',
        `│💧 *Humedad ::* ${cur.relative_humidity_2m}%`,
        `│💨 *Viento ::* ${cur.wind_speed_10m} km/h`,
        rainProb != null ? `│☔ *Prob. lluvia ::* ${rainProb}%` : '',
        wx?.timezone ? `│🕒 *Zona horaria ::* ${wx.timezone}` : ''
      ].filter(Boolean);

      await msg.reply(lines.join('\n'));
    } catch (e) {
      await msg.reply(`> Error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  }
};
