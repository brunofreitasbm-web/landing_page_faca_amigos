/*
 * FaçaAmigos: cliente mínimo do Supabase Realtime (Broadcast), sem biblioteca.
 * Usado pela TV do salão (/tv) e pelo controle da equipe (/tv-controle) para conversar em tempo real.
 *
 * Cada TV tem um código (8 letras e números). O canal é "tv-<código>": só quem sabe o código fala com aquela TV.
 * A chave abaixo é a chave pública (anon) do projeto, feita para ficar no navegador. Ela não lê nem grava nenhum dado:
 * só abre a conexão de Broadcast, que não passa por tabela.
 *
 * Uso:
 *   var canal = FaRealtime.join('abcd2345', function (evento, dados) { ... }, function (status) { ... });
 *   canal.send('cmd', { type: 'ir' });   canal.isOnline();   canal.close();
 * Status: 'connecting' | 'online' | 'offline' | 'error'. Reconecta sozinho, com espera crescente.
 * Escrito em ES5 de propósito: navegadores de Smart TV antigos.
 */
(function (w) {
  'use strict';

  var HOST = 'wss://ivjvpdzsfjdpyabbzzuj.supabase.co/realtime/v1/websocket';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2anZwZHpzZmpkcHlhYmJ6enVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MDYwNjksImV4cCI6MjEwMDA4MjA2OX0.QdYzftTxdmYY8r_7sVe0mjjOqJ4nnOR3iyiWN18cgsQ';

  function join(code, onMessage, onStatus) {
    var topic = 'realtime:tv-' + code;
    var ws = null;
    var ref = 0;
    var heartbeat = null;
    var retry = 0;
    var closed = false;
    var joined = false;

    function status(s) {
      if (onStatus) onStatus(s);
    }

    function raw(obj) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    }

    function later() {
      retry++;
      setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, Math.min(retry, 5))));
    }

    function connect() {
      if (closed) return;
      status('connecting');
      try {
        ws = new WebSocket(HOST + '?apikey=' + KEY + '&vsn=1.0.0');
      } catch (e) {
        later();
        return;
      }
      ws.onopen = function () {
        raw({
          topic: topic, event: 'phx_join', ref: String(++ref), join_ref: '1',
          payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, 'private': false } }
        });
      };
      ws.onmessage = function (m) {
        var d;
        try { d = JSON.parse(m.data); } catch (e) { return; }
        if (d.topic !== topic) return;
        if (d.event === 'phx_reply') {
          if (d.payload && d.payload.status === 'ok') {
            joined = true;
            retry = 0;
            status('online');
          } else {
            status('error');
          }
        } else if (d.event === 'broadcast' && d.payload) {
          onMessage(d.payload.event, d.payload.payload);
        }
      };
      ws.onclose = function () {
        joined = false;
        clearInterval(heartbeat);
        status('offline');
        later();
      };
      ws.onerror = function () {
        try { ws.close(); } catch (e) { /* já fechado */ }
      };
      clearInterval(heartbeat);
      heartbeat = setInterval(function () {
        raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) });
      }, 25000);
    }

    connect();

    return {
      send: function (event, payload) {
        raw({
          topic: topic, event: 'broadcast', ref: String(++ref), join_ref: '1',
          payload: { type: 'broadcast', event: event, payload: payload }
        });
      },
      isOnline: function () { return joined; },
      close: function () {
        closed = true;
        clearInterval(heartbeat);
        try { ws.close(); } catch (e) { /* já fechado */ }
      }
    };
  }

  w.FaRealtime = { join: join };
})(window);
