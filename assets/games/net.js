// Código compartido por el bot y por las páginas de los juegos.
// Va en JavaScript sencillo porque se ejecuta tal cual en el WebView de WhatsApp
// (donde no hay módulos ni almacenamiento) y también dentro del bot.

// ── Firma y azar ──────────────────────────────────────────────────────────

/** Mezcla de 32 bits (FNV-1a con una vuelta final). */
function djHash(text, seed) {
  var h = (seed >>> 0) ^ 0x811c9dc5;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Firma corta de un texto con la clave de la partida. */
function djMac(key, text) {
  var a = djHash(key + '|' + text, 0x9e3779b9);
  var b = djHash(text + '|' + key + '|' + a, 0x85ebca6b);
  return (a.toString(36) + b.toString(36)).slice(0, 10);
}

/** Número entre 0 y 1 que depende solo de la semilla y del índice. */
function djRand(seed, index) {
  return djHash(String(seed) + ':' + index, 0x1b873593) / 4294967296;
}

/** Elige una entrada de una lista con pesos (`weight`) usando djRand. */
function djPick(list, seed, index) {
  var total = 0, i;
  for (i = 0; i < list.length; i++) total += list[i].weight;
  var roll = djRand(seed, index) * total;
  for (i = 0; i < list.length; i++) {
    roll -= list[i].weight;
    if (roll <= 0) return i;
  }
  return list.length - 1;
}

/** Texto que se firma en cada guardado: partida, número de envío y datos. */
function djPayload(id, seq, values, extra) {
  return id + '|' + seq + '|' + values.join('.') + '|' + (extra || '');
}

/** Código para guardar a mano: `ID-1a.2.3-firma` (valores en base 36). */
function djCode(id, key, values) {
  var data = values.map(function (n) { return Math.max(0, Math.floor(n)).toString(36); }).join('.');
  return (id + '-' + data + '-' + djMac(key, 'code|' + id + '|' + data).slice(0, 5)).toUpperCase();
}

// ── Cliente MQTT mínimo sobre WebSocket ────────────────────────────────────
// Solo lo necesario: conectar, suscribirse, publicar (QoS 0) y mantener viva la
// conexión. Se reconecta solo.

function mqttLite(url, onMessage, onState, WS) {
  WS = WS || WebSocket;
  var enc = new TextEncoder(), dec = new TextDecoder();
  var ws = null, open = false, closed = false, topics = {}, buffer = new Uint8Array(0);
  var retry = 0, pingTimer = null, retryTimer = null, lastData = 0, packetId = 1;
  var clientId = 'dj' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

  function str(text) {
    var bytes = enc.encode(text), out = new Uint8Array(bytes.length + 2);
    out[0] = bytes.length >> 8; out[1] = bytes.length & 255; out.set(bytes, 2);
    return out;
  }

  function packet(type, parts) {
    var length = 0, i;
    for (i = 0; i < parts.length; i++) length += parts[i].length;
    var head = [type], rest = length;
    do { var b = rest % 128; rest = Math.floor(rest / 128); head.push(rest > 0 ? b | 128 : b); } while (rest > 0);
    var out = new Uint8Array(head.length + length), at = head.length;
    out.set(head, 0);
    for (i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
    return out;
  }

  function send(bytes) {
    try { if (ws && ws.readyState === 1) { ws.send(bytes); return true; } } catch (e) {}
    return false;
  }

  function state(now) {
    if (open === now) return;
    open = now;
    try { if (onState) onState(open); } catch (e) {}
  }

  function subscribe(topic) {
    send(packet(0x82, [new Uint8Array([packetId >> 8, packetId & 255]), str(topic), new Uint8Array([0])]));
    packetId = packetId % 65535 + 1;
  }

  function handle(type, body) {
    if (type === 2) {                       // CONNACK
      if (body[1] !== 0) { try { ws.close(); } catch (e) {} return; }
      retry = 0;
      for (var topic in topics) subscribe(topic);
      state(true);
    } else if (type === 3) {                // PUBLISH
      var length = (body[0] << 8) | body[1];
      var name = dec.decode(body.subarray(2, 2 + length));
      var text = dec.decode(body.subarray(2 + length));
      try { onMessage(name, text); } catch (e) {}
    }
  }

  function feed(chunk) {
    var joined = new Uint8Array(buffer.length + chunk.length);
    joined.set(buffer, 0); joined.set(chunk, buffer.length);
    buffer = joined;
    for (;;) {
      if (buffer.length < 2) return;
      var length = 0, shift = 1, at = 1, b;
      do {
        if (at >= buffer.length) return;
        b = buffer[at++]; length += (b & 127) * shift; shift *= 128;
      } while (b & 128 && at < 5);
      if (buffer.length < at + length) return;
      var type = buffer[0] >> 4, body = buffer.subarray(at, at + length);
      buffer = buffer.slice(at + length);
      handle(type, body);
    }
  }

  function drop() {
    state(false);
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (closed || retryTimer) return;
    retry = Math.min(retry + 1, 6);
    retryTimer = setTimeout(function () { retryTimer = null; connect(); }, 1000 * retry * retry);
    if (retryTimer.unref) retryTimer.unref();
  }

  function connect() {
    if (closed) return;
    buffer = new Uint8Array(0);
    var socket;
    try { socket = new WS(url, 'mqtt'); } catch (e) { drop(); return; }
    ws = socket;
    socket.binaryType = 'arraybuffer';
    socket.onopen = function () {
      lastData = Date.now();
      // CONNECT: MQTT 3.1.1, sesión limpia, aviso de vida cada 60 s.
      send(packet(0x10, [str('MQTT'), new Uint8Array([4, 2, 0, 60]), str(clientId)]));
      pingTimer = setInterval(function () {
        if (Date.now() - lastData > 95000) { try { socket.close(); } catch (e) {} return; }
        send(new Uint8Array([0xc0, 0]));
      }, 25000);
      if (pingTimer.unref) pingTimer.unref();
    };
    socket.onmessage = function (event) {
      if (socket !== ws) return;
      lastData = Date.now();
      if (typeof event.data === 'string') return;
      feed(new Uint8Array(event.data));
    };
    socket.onclose = function () { if (socket === ws) { ws = null; drop(); } };
    socket.onerror = function () { try { socket.close(); } catch (e) {} };
  }

  connect();

  return {
    isOpen: function () { return open; },
    sub: function (topic) { topics[topic] = 1; if (open) subscribe(topic); },
    pub: function (topic, text) {
      if (!open) return false;
      return send(packet(0x30, [str(topic), enc.encode(text)]));
    },
    close: function () {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      send(new Uint8Array([0xe0, 0]));
      try { if (ws) ws.close(); } catch (e) {}
      state(false);
    }
  };
}
