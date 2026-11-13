// Parte común de las páginas de los juegos: guardado, sala y tamaño.
// `CFG` lo escribe el bot en cada página (partida, clave, servidores...).

var DJ = (function () {
  var cfg = CFG, net = cfg.net, seq = cfg.q || 0;
  var clients = [], active = null, chosen = false;
  var latest = null, sentText = '', ackText = '', waiting = false, resendTimer = null, unsavedSince = 0;
  var statusCb = null, stateCb = null, roomCb = null, roomTopic = '';
  var status = net && net.urls.length ? 'wait' : 'off';
  var base = (cfg.v || []).slice(), synced = false;

  function setStatus(next) {
    if (status === next) return;
    status = next;
    if (statusCb) statusCb(status);
  }

  function textOf(save) { return save.v.join('.') + '|' + (save.x || ''); }

  function flush() {
    if (!active || !active.isOpen() || !latest) return;
    var text = textOf(latest);
    if (text === ackText) { unsavedSince = 0; setStatus('ok'); return; }
    seq++;
    sentText = text;
    waiting = true;
    if (!unsavedSince) unsavedSince = Date.now();
    // Si el bot tarda en contestar se avisa (y la página enseña el código manual).
    setStatus(Date.now() - unsavedSince > 9000 ? 'late' : 'saving');
    active.pub(net.pre + '/up', JSON.stringify({
      s: cfg.id, q: seq, t: 'sv', v: latest.v, x: latest.x || '',
      m: djMac(cfg.k, djPayload(cfg.id, seq, latest.v, latest.x || ''))
    }));
  }

  function hello() {
    if (!active || !active.isOpen()) return;
    active.pub(net.pre + '/up', JSON.stringify({ s: cfg.id, q: 0, t: 'hi', v: [], x: '', m: djMac(cfg.k, djPayload(cfg.id, 0, [], 'hi')) }));
  }

  function onMessage(topic, text) {
    var msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (topic === roomTopic) { if (roomCb) roomCb(msg); return; }
    if (topic !== net.pre + '/s/' + cfg.id || !msg) return;
    if (typeof msg.q === 'number' && msg.q > seq) seq = msg.q;
    if (msg.t === 'st') {
      // La primera respuesta trae lo que el bot ya tenía guardado de esta
      // partida (la página pudo recargarse): se continúa desde ahí.
      if (!synced && Array.isArray(msg.v)) {
        synced = true;
        for (var i = 0; i < base.length; i++) base[i] = Math.max(base[i], Number(msg.v[i]) || 0);
      }
      if (stateCb) stateCb(msg);
      if (latest) flush(); else setStatus('ok');
    } else if (msg.t === 'ok') {
      if (waiting && msg.q >= seq) { waiting = false; ackText = sentText; }
      if (stateCb) stateCb(msg);
      if (latest && textOf(latest) !== ackText) flush(); else { unsavedSince = 0; setStatus('ok'); }
    }
  }

  function use(client) {
    if (chosen) return;
    chosen = true;
    active = client;
    for (var i = 0; i < clients.length; i++) if (clients[i] !== client) clients[i].close();
    ready();
  }

  function ready() {
    active.sub(net.pre + '/s/' + cfg.id);
    if (roomTopic) active.sub(roomTopic);
    // El verde solo sale cuando el bot ha contestado al menos una vez.
    setStatus(latest && textOf(latest) !== ackText ? 'saving' : (synced ? 'ok' : 'wait'));
    // La suscripción tarda un instante en quedar lista.
    setTimeout(function () { hello(); flush(); }, 350);
  }

  function start() {
    if (!net || !net.urls.length || typeof WebSocket === 'undefined') { setStatus('off'); return; }
    net.urls.forEach(function (url, index) {
      var client = mqttLite(url, onMessage, function (open) {
        if (!open) { if (client === active) setStatus('wait'); return; }
        if (chosen) { if (client === active) ready(); return; }
        // Se prefiere el primer servidor de la lista para que todos coincidan
        // en la misma sala: los demás solo se usan si ese no responde.
        if (index === 0) use(client);
        else setTimeout(function () {
          if (chosen) return;
          for (var i = 0; i < clients.length; i++) if (clients[i].isOpen()) { use(clients[i]); return; }
        }, 1500);
      });
      clients.push(client);
    });
    resendTimer = setInterval(function () {
      if (latest && textOf(latest) !== ackText) flush();
      else if (!synced) hello();
    }, 4000);
  }

  return {
    cfg: cfg,
    /** Totales guardados antes de abrir esta página; lo nuevo se suma encima. */
    base: base,
    start: start,
    status: function () { return status; },
    onStatus: function (cb) { statusCb = cb; cb(status); },
    /** Respuestas del bot: `{t:'st'|'ok', v:[...], x:'...'}` con lo que tiene guardado. */
    onState: function (cb) { stateCb = cb; },
    /** Guarda los totales de la partida (y un texto libre opcional). */
    save: function (values, extra) {
      latest = { v: values.map(function (n) { return Math.max(0, Math.floor(n)); }), x: extra || '' };
      flush();
    },
    code: function (values) { return djCode(cfg.id, cfg.k, values); },
    /** Sala compartida: lo que publica un jugador lo reciben todos los de la sala. */
    room: function (name, cb) {
      if (!net) return;
      roomTopic = net.pre + '/r/' + name;
      roomCb = cb;
      if (active && active.isOpen()) active.sub(roomTopic);
    },
    send: function (obj) {
      return !!(active && active.isOpen() && roomTopic && active.pub(roomTopic, JSON.stringify(obj)));
    },
    online: function () { return !!(active && active.isOpen()); }
  };
})();

// ── Interfaz común ────────────────────────────────────────────────────────

var $ = function (id) { return document.getElementById(id); };

/**
 * Indicador de guardado (id "net") y código manual (id "code"). `getValues`
 * da los totales de la partida y `hasProgress` dice si hay algo sin guardar.
 */
function djStatusUi(getValues, hasProgress) {
  var chip = $('net'), codeBox = $('code');
  var names = { ok: '🟢 Guardado', saving: '🟡 Guardando…', late: '🟠 El bot no responde', wait: '🟠 Conectando…', off: '⚪ Sin conexión' };
  function paint() {
    var s = DJ.status();
    if (chip) chip.textContent = names[s] || '';
    if (!codeBox) return;
    // El código solo hace falta cuando el guardado automático no está funcionando.
    if (hasProgress() && s !== 'ok' && s !== 'saving') {
      codeBox.style.display = 'block';
      codeBox.innerHTML = 'Para guardar a mano envía al chat:<br><b>' + DJ.cfg.px + 'canjear ' + DJ.code(getValues()) + '</b>';
    } else {
      codeBox.style.display = 'none';
    }
    if (window.djRefit) window.djRefit();
  }
  DJ.onStatus(paint);
  return paint;
}

/** Avisa a WhatsApp de la altura de la página (la burbuja no la calcula sola). */
function djFit() {
  // Solo se mide cuando la página lo pide (al cargar y cuando aparece o se
  // quita un bloque): así la burbuja no entra en un ciclo de cambios de tamaño.
  var last = 0;
  function fit() {
    var h = Math.ceil(document.getElementById('app').getBoundingClientRect().height) + 2;
    if (!h || Math.abs(h - last) < 2) return;
    last = h;
    try { if (window.AndroidBridge && window.AndroidBridge.updateSize) window.AndroidBridge.updateSize(h); } catch (e) {}
  }
  window.djRefit = fit;
  fit();
  setTimeout(fit, 120); setTimeout(fit, 600); setTimeout(fit, 1800);
  return fit;
}

/** Ancho útil de la burbuja (entre 280 y 420 px). */
function djWidth() {
  var w = document.documentElement.clientWidth || window.innerWidth || 340;
  return Math.max(280, Math.min(420, Math.floor(w) - 12));
}

/** Ejecuta `tick` en cada cuadro solo mientras la página está a la vista. */
function djLoop(tick) {
  var running = false, last = 0;
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    tick(dt, now);
    requestAnimationFrame(frame);
  }
  function start() { if (running || document.hidden) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  function stop() { running = false; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  start();
}

/** Toque o clic sobre un elemento, con la posición dentro de él. */
function djTap(el, cb) {
  function at(e) {
    var r = el.getBoundingClientRect(), p = e.changedTouches ? e.changedTouches[0] : e;
    return { x: (p.clientX - r.left) / r.width, y: (p.clientY - r.top) / r.height };
  }
  var touched = 0;
  el.addEventListener('touchstart', function (e) { touched = Date.now(); e.preventDefault(); cb(at(e), e); }, { passive: false });
  el.addEventListener('mousedown', function (e) { if (Date.now() - touched > 600) cb(at(e), e); });
}
