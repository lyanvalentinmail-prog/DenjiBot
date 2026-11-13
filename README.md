<h1 align="center">Denji bot</h1>

<p align="center">
  <img src="assets/banner.jpg" alt="Denji bot">
</p>

### **`Información importante`**

**Denji bot es un bot de WhatsApp basado en `Node.js` que utiliza la librería `@whiskeysockets/baileys`.**

**Inspirado en el personaje `Denji` de Chainsaw Man.** Incluye un panel de control para la terminal (pensado para Termux) con atajos, consola en vivo y dashboard.

### **`Funciones`**

**MAIN** — Información básica del bot: creador, estado, info, ping y menú.

**DOWNLOAD** — Descargas de Instagram, letras de canciones, Pinterest, audio y video de YouTube, Spotify y TikTok.

**PROFILE** — Gestión del perfil: matrimonio, divorcio, historial, foto de perfil, cumpleaños, descripción y género.

**ADMIN** — Herramientas de administración de grupos: abrir/cerrar, enlaces, kick, promote, tagall, mute, antilink y modo solo admins.

**STICKERS** — Creación, personalización y búsqueda de stickers (incluye estilo BRAT y Sticker.ly), y packs de stickers completos a partir de tus fotos.

**TOOLS** — Utilidades varias: IA conversacional, lectura de mensajes "ver una vez", conversión de sticker a imagen y hora exacta con reloj.

**ECONOMY** — Sistema económico completo: balance, ranking, apuestas, crímenes, depósitos, retiros, trabajo, diario y robos.

**GAMES** — Juegos que se abren dentro del chat: Snake, pesca, ajedrez y una arena multijugador, con el progreso guardado.

**RPG** — Personaje con nivel, inventario y equipo: trabajos, minería, caza, mazmorras, jefes, duelos, forja, cocina y misiones diarias.

**ANIME** — Más de 40 comandos de reacciones anime: besos, abrazos, caricias, bailes, emociones y acciones interactivas.

**LOGO** — Generador de logos con múltiples estilos: alas, neón, glitch, gaming, anime, PUBG, Matrix y más.

### 📥 NECESITAS INSTALAR UNA DE ESTAS HERRAMIENTAS

<p align="center">
  <a href="https://www.mediafire.com/file/llugt4zgj7g3n3u/com.termux_1020.apk/file"><img src="https://img.shields.io/badge/Descargar-Termux-26C6DA?style=for-the-badge&logo=android" alt="Download Termux"></a>
</p>

### **`INSTALACIÓN`**

> Nota: Copie y pegue los comandos en Termux uno por uno. Se necesita Node.js 22.18 o superior.

```bash
termux-setup-storage
```

```bash
apt update && apt upgrade && pkg install -y git nodejs ffmpeg imagemagick
```

```bash
git clone https://github.com/lyanvalentinmail-prog/DenjiBot && cd DenjiBot
```

```bash
npm install
```

```bash
npm start
```

> Si aparece (Y/I/N/O/D/Z) [default=N] ? use la letra "y" + "ENTER" para continuar con la instalación.
>
> Si clonaste el bot en el almacenamiento compartido (`/sdcard`), instala con `npm install --no-bin-links`.

### **`PANEL DE CONTROL (npm start)`**

`npm start` abre el panel de Denji bot. Se maneja con las flechas y Enter, o directamente con los atajos numéricos:

| Atajo | Opción | Qué hace |
| :---: | --- | --- |
| `1` | **Start** | Inicia el bot. Si la sesión no está vinculada pregunta el método: **código QR** o **código de 8 dígitos** (pairing code). |
| `2` | **Consola del bot** | Logs en vivo y dashboard. |
| `3` | **Sesiones** | Lista las sesiones guardadas (número, tamaño, última actividad), permite crear otra y elegir cuál usa el bot. |
| `4` | **Eliminar sesiones** | Borra una sesión o todas (pide confirmación). |
| `5` | **Actualizar bot** | Ejecuta `git pull`, ofrece instalar dependencias si cambiaron y reiniciar el bot. |
| `6` | **Personalizar bot** | Estilo y formato del menú, reacciones, reloj, nombre, prefijo, moneda, desarrollador, dueños, banners, logs y reinicio automático. |
| `7` | **Detener bot** | Aparece cuando el bot está encendido. |
| `0` | **Salir** | Cierra el panel (y apaga el bot). |

También puedes abrir una sección directamente: `npm start -- start`, `npm start -- consola`, `npm start -- sesiones`, `npm start -- eliminar`, `npm start -- actualizar`, `npm start -- personalizar`.

#### Consola del bot

Al iniciar el bot se abre su consola con el estado de la conexión, un resumen (usuarios, grupos, comandos, espacio usado) y los logs en vivo.

| Tecla | Acción |
| :---: | --- |
| `D` | Dashboard completo |
| `L` | Volver a los logs |
| `↑` `↓` | Desplazarse (`F` vuelve al final) |
| `R` | Reiniciar el bot (o iniciarlo si está detenido) |
| `X` | Detener el bot |
| `Q` | Volver a mostrar el QR mientras se vincula |
| `M` | Volver al menú (el bot sigue encendido) |

El **dashboard** muestra: estado y número del bot, tiempo encendido, memoria, usuarios registrados y activos, grupos, comandos y mensajes (totales y de la sesión), comandos más usados, espacio que ocupan los datos de los usuarios (total, promedio por usuario y los 5 que más ocupan), tamaño de la base de datos y de las sesiones, espacio libre en disco y uso de RAM/CPU.

#### Personalizar bot

Los cambios se guardan en `settings.json` y el bot los aplica al instante, sin reiniciar. Ese archivo no se sube a git, así que `git pull` nunca pisa tu configuración.

- **Estilo del menú**: el diseño con el que se escribe el menú. Hay tres: **Denji style** (el original), **Chainsaw man style** y **Simple style**. Al mover la selección el panel muestra un ejemplo de cada uno y con Enter se activa. Cada estilo puede tener su propio banner (*Banner de cada estilo*); mientras no lo tenga usa el banner principal. Los dueños también pueden cambiarlo desde WhatsApp con `.setmenu denji`, `.setmenu chainsaw` o `.setmenu simple`.
- **Formato del menú**: `lista` envía un mensaje interactivo con un botón que despliega las categorías; `texto` envía el menú completo en un mensaje. Con cualquier formato, `.menu todo` muestra todos los comandos y `.menu <categoría>` solo una categoría. Desde WhatsApp: `.setmenu lista` o `.setmenu texto`.
- **Reacciones**: el bot reacciona con un emoji al mensaje de quien usa un comando. Por defecto 🕘 mientras prepara la respuesta (*Espera / cargando*) y ⭐️ al terminar (*Listo*). Puedes cambiar cada emoji, quitarlo o apagar todas las reacciones. También puedes añadir reacción a otros momentos, que vienen sin emoji: *Error*, *Sin permiso* y *Comando desconocido*; y en *Por comando* darle a un comando su propio emoji, que sustituye al de *Listo* (por ejemplo `sticker` → 🎨).
- **Reloj (.hora)**: qué envía el comando de la hora: reloj en vivo e imagen, solo uno de los dos, o un archivo `.html`. Ver [Hora exacta](#hora-exacta-hora).
- **Dueños**: números que pueden usar los comandos de dueño. Por defecto no hay ninguno: añade el tuyo aquí.
- **Banner principal**: imagen del bot (menú, perfil e información). Por defecto `assets/banner.jpg`; admite una ruta dentro del bot o una URL.

### **`PACKS DE STICKERS (.spack)`**

1. Envía tus fotos con el mensaje `.spack` (puedes mandar varias a la vez). Opcional: `.spack Nombre | Autor`.
2. El bot las carga y te avisa cuántas lleva. Mientras el pack esté abierto, cada foto que envíes se agrega (hasta 60). Para agregar un sticker que ya existe, respóndele con `.spack`.
3. `.done` cierra el pack y lo envía como paquete de stickers para añadirlo a WhatsApp (`.spack done` hace lo mismo). `.cancel` lo descarta.

`.done` es parte de `.spack`, por eso no aparece como comando aparte en el menú.

Si tu WhatsApp no muestra el paquete, `.done stickers` envía los stickers uno por uno. El pack se cancela solo tras 15 minutos sin actividad.

### **`HORA EXACTA (.hora)`**

`.hora` responde con dos cosas:

1. **El reloj en vivo dentro del chat**: una vista HTML con reloj analógico y digital, la fecha y la hora de otras zonas, que WhatsApp dibuja en la propia burbuja del mensaje.
2. **Una imagen del reloj** con la hora, la fecha y la zona. Una imagen se ve en cualquier WhatsApp, así que siempre queda un reloj a la vista aunque tu teléfono no dibuje el reloj en vivo.

Sin indicar lugar usa el país de tu número; también acepta `.hora españa`, `.hora tokio` o `.hora America/Bogota`.

El reloj en vivo usa el mismo tipo de mensaje con el que WhatsApp muestra las respuestas de Meta AI. No es una función documentada y tiene límites que el bot no puede saltarse:

- Solo lo dibuja la **aplicación del teléfono**. En WhatsApp Web y Escritorio aparece únicamente una línea de texto con la hora.
- WhatsApp decide desde sus servidores, cuenta por cuenta, si muestra este tipo de mensajes cuando no vienen de Meta AI. En algunas cuentas la burbuja llega vacía o plegada y desde el bot no se puede saber ni cambiar.
- Ayuda tener **WhatsApp actualizado** y **guardar el número del bot en tus contactos**: WhatsApp pliega estas vistas cuando vienen de un número desconocido.

Puedes elegir qué envía `.hora` en `npm start` → **Personalizar bot** → **Reloj (.hora)**:

| Opción | Qué envía |
| --- | --- |
| **Reloj en vivo + imagen** (por defecto) | La vista HTML y, debajo, la imagen. |
| **Solo reloj en vivo** | La vista HTML y un texto con la hora. Para cuando en tu WhatsApp se ve bien y la imagen sobra. |
| **Solo imagen** | Solo la imagen. Para cuando en tu WhatsApp el reloj en vivo no aparece. |
| **Archivo .html** | El reloj como archivo, que se abre con el navegador del teléfono. |

También puedes pedir una forma concreta en un mensaje: `.hora chat`, `.hora imagen` o `.hora archivo` (con lugar: `.hora imagen tokio`).

### **`JUEGOS DENTRO DEL CHAT (.juegos)`**

Los juegos se envían igual que el reloj de `.hora`: una vista HTML que WhatsApp dibuja en la burbuja del mensaje y se juega ahí mismo.

| Comando | Juego |
| --- | --- |
| `.snake` | Snake. Cada manzana da monedas y tu récord queda guardado. |
| `.fish` | Pesca en un río: lanzas la caña y tocas cuando el pez pica. **Lo que atrapas va a tu inventario del RPG** (`.inventario`, `.vender`, `.cocinar`). |
| `.ajedrez` | Ajedrez contra el bot (fácil, medio, difícil), de a dos en el mismo teléfono, o en línea. La partida se guarda: al volver a pedirlo sigues donde ibas (`.ajedrez nueva` empieza de cero). |
| `.arena` | Multijugador en vivo: todos los que piden `.arena` en el mismo chat entran a la misma sala y corren por las estrellas. Con `.arena CÓDIGO` juegan juntas personas de chats distintos. Si no hay nadie, juegas contra bots. |
| `.juegos` | La lista y tus récords. |

**Cómo se guarda el progreso.** WhatsApp no deja que estas vistas guarden nada en el teléfono, así que el juego le envía tu progreso al bot por internet mientras juegas. Arriba a la derecha del juego verás 🟢 *Guardado* cuando el bot lo recibió. Si no hay conexión, el juego muestra un código y `.canjear código` guarda lo mismo a mano. Lo que se gana con un mensaje de juego es siempre para quien lo pidió, lo abra quien lo abra.

Para esa conexión el bot y los juegos usan servidores de mensajes públicos y gratuitos (MQTT). Vienen tres configurados y no hay que tocar nada; si quieres usar otros, cambia la lista `gameServers` en `settings.json` (direcciones `wss://`). Las partidas duran 48 horas.

Valen los mismos límites que en el [reloj en vivo](#hora-exacta-hora): solo lo dibuja la app del teléfono y no en todas las cuentas. Si en tu WhatsApp no aparece, añade `archivo` (`.snake archivo`) y el bot manda el juego como archivo `.html` para abrirlo con el navegador; ahí también se guarda.

### **`RPG (.rpg)`**

Cada persona tiene un personaje por chat, con nivel, vida, inventario y equipo. `.rpg` muestra el tuyo y `.menu rpg` la lista completa de comandos. Algunos:

- **Ganar**: `.trabajar`, `.oficio`, `.crimen`, `.minar`, `.talar`, `.cazar`, `.lanzar`, `.aventura`, `.cofre`, `.misiones`.
- **Combate**: `.mazmorra` (un piso por comando; `.mazmorra salir` asegura el botín), `.jefe` (jefe del chat, entre todos), `.duelo @persona`.
- **Objetos**: `.inventario`, `.tienda`, `.comprar`, `.vender`, `.equipar`, `.usar`, `.forjar`, `.cocinar`, `.mejorar`, `.regalar`.
- **Estado**: `.curar`, `.descansar`, `.entrenar`, `.tiempos`, `.rtop`.

Usa las mismas monedas que los comandos de economía.

### **`OTROS COMANDOS`**

```bash
npm run bot    # inicia el bot sin panel
npm run qr     # sin panel, vinculando con código QR
npm run code   # sin panel, vinculando con código de 8 dígitos
```

Si la terminal no es interactiva (pm2, paneles de hosting, etc.), `npm start` ejecuta el bot directamente.

### **Solución de Problemas**

- **El QR no cabe en pantalla**: aleja el zoom pellizcando la pantalla de Termux, o usa el código de 8 dígitos.
- **El bot no responde**: revisa la consola del bot (`2`) y que tu cuenta de WhatsApp siga vinculada.
- **Problemas de sesión**: elimina la sesión desde el panel (`4`) y vuelve a vincularla con Start (`1`).
- **Errores de dependencias**: elimina la carpeta **`node_modules`** y ejecuta **`npm install`** nuevamente.

## Créditos

Denji bot está basado en [Raiden-WaBot](https://github.com/Ryuzei-Ts/Raiden-WaBot), creado por [Ryuzei-Ts](https://github.com/Ryuzei-Ts).
