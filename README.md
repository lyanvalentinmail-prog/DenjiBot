<h1 align="center">Denji bot</h1>

<p align="center">
  <img src="assets/banner.jpg" alt="Denji bot">
</p>

### **`Información importante`**

**Denji bot es un bot de WhatsApp basado en `Node.js` que utiliza la librería `@whiskeysockets/baileys`.**

**Inspirado en el personaje `Denji` de Chainsaw Man.** Incluye un panel de control para la terminal (pensado para Termux) con atajos, consola en vivo y dashboard, y todos los comandos SFW de **YukiBot-MD** (sin contenido NSFW).

### **`Funciones`**

- **PRINCIPAL (`main`)** — Menú por categorías (10 estilos visuales), información del bot, estado, ping, invitación y reportes.
- **DESCARGAS (`downloads`)** — YouTube (`.play` / `.play2` / `.ytsearch`), Spotify (`.spotify`), SoundCloud (`.soundcloud`), Threads (`.threads`), TikTok, Instagram, Facebook, Twitter/X, Pinterest, Google Imágenes, APK (Aptoide), MediaFire y Google Drive.
- **STICKERS (`stickers`)** — Stickers con formas y efectos (`.s`), cambio de autor `.wm`/`.take`, memes `.smeme`, texto transparente/animado `.ttp`/`.attp`, BRAT estático y animado, citas `.qc`, `.emojimix`, Sticker.ly y gestión de paquetes propios (`.newpack`, `.addsticker`, `.getpack`).
- **UTILIDADES (`utils`)** — ChatGPT (`.ia`), mejora y escalado de imágenes hasta 4× con **bigger.pics** (`.hd`, `.hd 4x`, `.hd anime`, `.hd deblur`, `.hd restore`, `.hd web`), quitar fondo (`.removebg`), `.tomp3`/`.toptt`, 12 efectos de audio (`.bass`, `.nightcore`, `.robot`…), identificador musical `.shazam`, letras `.lyrics`, `.wikipedia`, `.clima`, `.qrcode`, `.ssweb`, `.calc`, `.styletext`, `.acortar`, `.ocr`, `.voz`, `.readmore`, `.base64`/`.morse`/`.binario`, traductor, `.toimg`, `.tourl`, `.read`, `.getpic`, `.gitclone` y `.get`.
- **ANIME (`anime`)** — `.waifu`, `.neko`, identificador de escenas `.whatanime` (trace.moe), `.ppcouple` y 66 reacciones SFW interactivas en español e inglés.
- **GACHA (`gacha`)** — Sistema completo de colección de personajes: `.rw`, `.claim`, `.harem`, `.trade`, `.sell`, `.buychar`, `.vote`, `.robwaifu` y rankings.
- **ECONOMÍA (`economy`)** — Balance, banco, trabajo, crimen, minería, pesca, caza, rituales, mazmorras, aventura, casino, ruleta, slots, tres en raya (`.ttt`), `.ahorcado`, tienda y duelos matemáticos.
- **PERFIL (`profile`)** — Perfil, niveles y XP, AFK, matrimonios, divorcios, cumpleaños, género, descripción, hobbies y tabla de líderes.
- **GRUPOS (`group`)** — Bienvenida y despedida personalizables, antilink, antistatus, alertas, advertencias (`.warn`), silenciar usuarios (`.mute`/`.unmute`), borrar mensajes (`.del`), encuestas (`.encuesta`), `.admins`, conteo de mensajes, `.kick`, `.promote`, `.demote`, `.tagall`, `.hidetag` y modo solo admins.
- **SUB-BOTS (`socket`)** — Vinculación de Sub-Bots por código (`.code`) o QR (`.qr`), listado de sockets y personalización de nombre, prefijo, moneda, banner, foto y canal.
- **OWNER (`owner`)** — Configuración de estilo y formato del menú (`.setmenu`), eliminación completa o selectiva de datos (`.resetbot`), actualización en caliente (`.update`), reinicio y herramientas de propietario.

### **`INSTALACIÓN`**

> Se necesita Node.js 22.18 o superior y `ffmpeg`.

```bash
apt update && apt upgrade && pkg install -y git nodejs ffmpeg imagemagick
git clone https://github.com/lyanvalentinmail-prog/DenjiBot && cd DenjiBot
npm install
npm start
```

> Si clonaste el bot en el almacenamiento compartido (`/sdcard`), instala con `npm install --no-bin-links`.

### **`MENÚ LIGERO Y PERSONALIZABLE`**

El menú está diseñado para no saturar el chat:

- **Estilos visuales (`.setmenu <tema>`)**:
  - `yuki` *(por defecto)* — Estética delicada inspirada en YukiBot-MD.
  - `denji` — Marco clásico de DenjiBot, limpio y directo.
  - `chainsaw` — Estilo Chainsaw Man con sierras, cadenas y separadores marcados.
  - `mystic` — Inspirado en TheMystic-Bot-MD (marcos dobles, `✯` y `<SECCIÓN />`).
  - `gata` — Inspirado en GataBot-MD (`❰❰ ❱❱`, flechas `➺` y checks `✓`).
  - `alya` — Inspirado en AlyaBot-MD (cintas onduladas, `❖` y kaomojis).
  - `michi` — Inspirado en MichiBot (estilo botánico con gatitos `🐱`, `🍃` y `🍀`).
  - `loli` — Inspirado en LoliBot-MD (etiquetas compactas `<[ SECCIÓN ]>`).
  - `shadow` — Inspirado en ShadowBot-MD (estética oscura con glifos `𖤐` y `⌬`).
  - `simple` — Minimalista y sin adornos.
- **Formatos de vista (`.setmenu <formato>`)**:
  - `lista` *(por defecto)* — Tarjeta corta con botón desplegable para abrir solo la categoría que buscas.
  - `categorias` — Índice compacto en texto con el conteo de cada sección.
  - `texto` — Menú completo resumido a una línea por comando y plegado con *Leer más*.
- **Atajos útiles**:
  - `.menu <categoría>` — Muestra solo esa sección (ej.: `.menu descargas`, `.menu gacha`, `.menu anime`).
  - `.menu <comando>` — Muestra la ficha de un comando con todos sus alias y uso (ej.: `.menu sticker`).
  - `.allmenu` o `.menu todo` — Muestra el menú completo plegado.
  - `.setmenu preview <tema>` y `.setmenu banner <url|off>` — Vista previa y banner propio por estilo.

### **`PANEL DE CONTROL (npm start)`**

| Atajo | Opción | Qué hace |
| :---: | --- | --- |
| `1` | **Start** | Inicia el bot (vinculación por **código QR** o **código de 8 dígitos**). |
| `2` | **Consola del bot** | Logs en vivo y dashboard (`D` dashboard, `L` logs, `R` reiniciar, `X` detener). |
| `3` | **Sesiones** | Gestiona y cambia entre sesiones guardadas. |
| `4` | **Eliminar sesiones** | Borra una sesión o todas (con confirmación). |
| `5` | **Actualizar bot** | Ejecuta `git pull`, ofrece instalar dependencias y reiniciar. |
| `6` | **Personalizar bot** | Estilo y formato del menú (con vista previa), reacciones, nombre, prefijo, moneda, desarrollador, dueños, banners, logs y reinicio automático. |
| `7` | **Eliminar datos** | Elimina todos los datos del bot (fábrica) o solo base de datos, sub-bots, ajustes o caché. |
| `8` | **Detener bot** | Detiene el bot si está encendido. |
| `0` | **Salir** | Cierra el panel y apaga el bot. |

### **`OTROS COMANDOS`**

```bash
npm run bot     # inicia el bot sin panel
npm run qr      # sin panel, vinculando con código QR
npm run code    # sin panel, vinculando con código de 8 dígitos
npm run reset   # elimina todos los datos locales del bot desde la terminal
npm run build   # verificación de tipos TypeScript
```

## Créditos

- Base del proyecto: [Raiden-WaBot](https://github.com/Ryuzei-Ts/Raiden-WaBot) por [Ryuzei-Ts](https://github.com/Ryuzei-Ts).
- Comandos y estilo Yuki adaptados de [YukiBot-MD](https://github.com/iamDestroy/YukiBot-MD) por [iamDestroy](https://github.com/iamDestroy).
