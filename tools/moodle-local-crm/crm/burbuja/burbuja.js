/*
  local_crm · la burbuja del chat (1.11.0)

  El chat del alumno con las tutoras de su curso, en una burbuja flotante en cualquier página
  del curso. Es la misma conversación de grupo de «Entrar al chat»: lo que se escribe aquí
  llega al CRM, y lo que responde la tutora (desde el CRM o desde Moodle) sale aquí.

  Sin dependencias ni compilación (cualquier tema, Moodle 4.4 a 5.2): llama a las funciones
  del plugin por /lib/ajax/service.php con la sesión del alumno, como hace core/ajax.
  «Tiempo real» preguntando: cada 4 s con la burbuja abierta, cada 30 s cerrada (solo para el
  contador) y cada 2 min con la pestaña en segundo plano. Sin websockets: los campus están en
  hosting compartido.
*/
(function () {
  'use strict';
  var cfg = window.LOCAL_CRM_BURBUJA;
  if (!cfg || document.getElementById('lcrm-burbuja')) { return; }
  var T = cfg.textos;
  var ABIERTA = 4000, CERRADA = 30000, OCULTA = 120000, MAX_ESPERA = 120000;
  var clave = 'lcrm-burbuja-abierta-' + cfg.curso;

  var estado = { abierta: false, ultimo: 0, cargada: false, noleidos: 0, enviando: false, fallos: 0, temporizador: null };
  var tituloOriginal = document.title;

  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') { n.textContent = attrs[k]; } else { n.setAttribute(k, attrs[k]); }
    });
    (hijos || []).forEach(function (h) { n.appendChild(h); });
    return n;
  }

  function llamar(metodo, args, segundoPlano) {
    var url = cfg.ajax + '?sesskey=' + encodeURIComponent(cfg.sesskey) + '&info=' + metodo
      + (segundoPlano ? '&nosessionupdate=true' : '');
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ index: 0, methodname: metodo, args: args }])
    }).then(function (r) { return r.json(); }).then(function (d) {
      // Sesión caducada o error general: service.php devuelve un objeto, no la lista.
      if (!Array.isArray(d)) { throw d; }
      if (d[0].error) { throw d[0].exception || d[0]; }
      return d[0].data;
    });
  }

  // --- La interfaz ---------------------------------------------------------------------------
  var icono = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z"/></svg>';
  var boton = el('button', { type: 'button', id: 'lcrm-burbuja', 'class': 'lcrm-boton',
    'aria-label': T.burbuja_abrir, 'aria-expanded': 'false', 'aria-controls': 'lcrm-panel' });
  boton.innerHTML = icono;
  var globo = el('span', { 'class': 'lcrm-globo', hidden: 'hidden', 'aria-hidden': 'true' });
  boton.appendChild(globo);

  var cerrar = el('button', { type: 'button', 'class': 'lcrm-cerrar', 'aria-label': T.burbuja_cerrar, text: '×' });
  var cabecera = el('div', { 'class': 'lcrm-cabecera' }, [
    el('div', {}, [
      el('div', { 'class': 'lcrm-titulo', text: T.burbuja_titulo }),
      el('div', { 'class': 'lcrm-subtitulo', text: T.burbuja_subtitulo })
    ]),
    cerrar
  ]);
  var aviso = el('div', { 'class': 'lcrm-aviso', hidden: 'hidden', role: 'status' });
  var lista = el('div', { 'class': 'lcrm-lista', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  var vacio = el('div', { 'class': 'lcrm-vacio', text: T.burbuja_vacio });
  lista.appendChild(vacio);
  var texto = el('textarea', { 'class': 'lcrm-texto', rows: '1', maxlength: '4000',
    placeholder: T.burbuja_escribe, 'aria-label': T.burbuja_escribe });
  var enviar = el('button', { type: 'submit', 'class': 'lcrm-enviar', 'aria-label': T.burbuja_enviar });
  enviar.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>';
  var formulario = el('form', { 'class': 'lcrm-formulario' }, [texto, enviar]);
  var panel = el('div', { id: 'lcrm-panel', 'class': 'lcrm-panel', role: 'dialog',
    'aria-label': T.burbuja_titulo, hidden: 'hidden' }, [cabecera, aviso, lista, formulario]);

  document.body.appendChild(panel);
  document.body.appendChild(boton);

  // --- Pintar ----------------------------------------------------------------------------------
  function hora(fecha) {
    var d = new Date(fecha * 1000), hoy = new Date();
    var h = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === hoy.toDateString() ? h : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + h;
  }

  var pintados = {};
  function pintar(mensajes) {
    if (!mensajes || !mensajes.length) { return; }
    var abajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 60;
    mensajes.forEach(function (m) {
      if (pintados[m.id]) { return; }
      pintados[m.id] = true;
      if (vacio.parentNode) { vacio.parentNode.removeChild(vacio); }
      var cuerpo = el('div', { 'class': 'lcrm-cuerpo' });
      cuerpo.innerHTML = m.html; // Ya limpio en el servidor (format_text).
      Array.prototype.forEach.call(cuerpo.querySelectorAll('a'), function (a) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      });
      var pie = el('div', { 'class': 'lcrm-pie', text: (m.mio ? '' : m.de + ' · ') + hora(m.fecha) });
      lista.appendChild(el('div', { 'class': 'lcrm-mensaje ' + (m.mio ? 'lcrm-mio' : 'lcrm-suyo') }, [cuerpo, pie]));
    });
    if (abajo || !estado.cargada) { lista.scrollTop = lista.scrollHeight; }
  }

  function contador(n) {
    estado.noleidos = n;
    if (n > 0) {
      globo.textContent = n > 9 ? '9+' : String(n);
      globo.removeAttribute('hidden');
      boton.classList.add('lcrm-nuevo');
      boton.setAttribute('aria-label', T.burbuja_abrir + ' · ' + T.burbuja_nuevo.replace('{$a}', n));
      document.title = '(' + n + ') ' + tituloOriginal;
    } else {
      globo.setAttribute('hidden', 'hidden');
      boton.classList.remove('lcrm-nuevo');
      boton.setAttribute('aria-label', T.burbuja_abrir);
      document.title = tituloOriginal;
    }
  }

  function mostrarAviso(t) {
    if (t) { aviso.textContent = t; aviso.removeAttribute('hidden'); } else { aviso.setAttribute('hidden', 'hidden'); }
  }

  // --- Preguntar ---------------------------------------------------------------------------------
  function siguiente() {
    clearTimeout(estado.temporizador);
    if (estado.fin) { return; }
    var espera = document.hidden ? OCULTA : (estado.abierta ? ABIERTA : CERRADA);
    if (estado.fallos) { espera = Math.min(MAX_ESPERA, espera * Math.pow(2, estado.fallos)); }
    estado.temporizador = setTimeout(leer, espera);
  }

  function leer() {
    if (estado.fin) { return Promise.resolve(); }
    clearTimeout(estado.temporizador);
    var abierta = estado.abierta;
    var desde = abierta && !estado.cargada ? 0 : estado.ultimo;
    return llamar('local_crm_burbuja_leer', { courseid: cfg.curso, desde: desde, abierto: abierta }, !abierta)
      .then(function (r) {
        estado.fallos = 0;
        if (!r.disponible) { quitar(); return; }
        if (abierta && !estado.cargada) {
          estado.cargada = true;
          mostrarAviso(r.sintutora ? T.chat_sin_tutora : '');
        }
        if (abierta) {
          // Solo con la burbuja abierta se avanza: cerrada, solo llega el contador, y lo que
          // haya llegado se pinta al abrir.
          if (r.ultimo > estado.ultimo) { estado.ultimo = r.ultimo; }
          pintar(r.mensajes);
          contador(0);
        } else {
          contador(r.noleidos);
        }
      })
      .catch(function () { estado.fallos = Math.min(estado.fallos + 1, 5); })
      .then(siguiente);
  }

  function quitar() {
    estado.fin = true;
    clearTimeout(estado.temporizador);
    boton.remove();
    panel.remove();
  }

  // --- Abrir, cerrar y escribir ----------------------------------------------------------------
  function abrir() {
    estado.abierta = true;
    panel.removeAttribute('hidden');
    boton.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('lcrm-abierta');
    try { sessionStorage.setItem(clave, '1'); } catch (e) { /* sin almacenamiento: da igual */ }
    leer();
    setTimeout(function () { texto.focus(); }, 50);
  }

  function cerrarPanel() {
    estado.abierta = false;
    panel.setAttribute('hidden', 'hidden');
    boton.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('lcrm-abierta');
    try { sessionStorage.removeItem(clave); } catch (e) { /* da igual */ }
    boton.focus();
    siguiente();
  }

  boton.addEventListener('click', function () { if (estado.abierta) { cerrarPanel(); } else { abrir(); } });
  cerrar.addEventListener('click', cerrarPanel);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { cerrarPanel(); } });

  function ajustarAlto() {
    texto.style.height = 'auto';
    texto.style.height = Math.min(texto.scrollHeight, 140) + 'px';
    texto.style.overflowY = texto.scrollHeight > 140 ? 'auto' : 'hidden';
  }
  texto.addEventListener('input', ajustarAlto);
  texto.addEventListener('keydown', function (e) {
    // Intro envía; Mayús+Intro, salto de línea. En el móvil el Intro del teclado es salto.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !('ontouchstart' in window)) {
      e.preventDefault();
      formulario.requestSubmit ? formulario.requestSubmit() : enviarMensaje(e);
    }
  });

  function enviarMensaje(e) {
    if (e) { e.preventDefault(); }
    var t = texto.value.trim();
    if (!t || estado.enviando) { return; }
    estado.enviando = true;
    enviar.disabled = true;
    llamar('local_crm_burbuja_enviar', { courseid: cfg.curso, texto: t, desde: estado.ultimo }, false)
      .then(function (r) {
        texto.value = '';
        ajustarAlto();
        mostrarAviso(r.sintutora ? T.chat_sin_tutora : '');
        if (r.ultimo > estado.ultimo) { estado.ultimo = r.ultimo; }
        estado.cargada = true;
        pintar(r.mensajes);
        lista.scrollTop = lista.scrollHeight;
      })
      .catch(function (err) {
        mostrarAviso((err && err.message) || T.burbuja_error);
      })
      .then(function () {
        estado.enviando = false;
        enviar.disabled = false;
        texto.focus();
      });
  }
  formulario.addEventListener('submit', enviarMensaje);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { leer(); } else { siguiente(); }
  });

  // «Entrar al chat» de la actividad Chat abre la burbuja en vez de ir a la mensajería: el
  // botón la llama (chat_directo::script_del_boton) y chat.php trae aquí con #lcrm-chat.
  window.LOCAL_CRM_BURBUJA_ABRIR = function () { if (!estado.abierta) { abrir(); } };
  var pedida = location.hash === '#lcrm-chat';
  if (pedida && history.replaceState) { history.replaceState(null, '', location.pathname + location.search); }

  // Si estaba abierta en la página anterior del curso, sigue abierta (salvo en el móvil,
  // donde ocupa la pantalla entera y taparía la página nueva).
  var seguirAbierta = false;
  try { seguirAbierta = sessionStorage.getItem(clave) === '1'; } catch (e) { /* da igual */ }
  if (pedida || (seguirAbierta && window.matchMedia && !window.matchMedia('(max-width: 600px)').matches)) {
    abrir();
  } else {
    leer();
  }
})();
