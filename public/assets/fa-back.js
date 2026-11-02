/* fa-back.js — botão/gesto "voltar" do celular navega DENTRO da página (telas, abas, modais).
 *
 * O site troca de "tela" por estado (hidden/classes), sem rotas. Sem ajuda, o voltar do aparelho
 * ignora essas telas e sai da página. Este módulo é o ÚNICO ponto que mexe em history/popstate.
 *
 *   var setDepth = faBack.use('nome-do-dono', function onBack() { ...desfaz 1 nível interno... });
 *   setDepth(n);   // n = quantos passos de "voltar" internos existem agora (0 = raiz)
 *
 * - Cada nível aberto empilha 1 entrada no histórico (pushState, mesma URL).
 * - Um único listener de popstate chama o onBack do dono da entrada mais recente.
 * - Se a tela saiu do nível por um botão da própria página, as entradas sobrando são removidas
 *   com history.go(-n) e o popstate resultante é ignorado (contador de supressão).
 * - Se o onBack não reduziu o depth, a pilha é ressincronizada (setTimeout 0).
 * - Na raiz (depth 0 em todos os donos) nada é empilhado: voltar sai da página normalmente.
 *
 * Limite conhecido: recarregar a página (SSO, redirect de pagamento, F5) perde a pilha em memória.
 * As entradas antigas continuam no histórico do navegador; ver `base` abaixo.
 */
(function (w) {
  'use strict';
  if (w.faBack) return;

  var hist = w.history;
  var owners = {};   // id -> { depth, onBack }
  var entries = [];  // 1 item por entrada de histórico empilhada: id do dono, ou null se órfã
  var suppress = 0;  // popstates provocados por nós (history.go) que devem ser ignorados
  var timer = 0;
  // Após um reload o state da entrada atual ainda carrega o índice antigo; numeramos a partir dele.
  var base = (hist.state && typeof hist.state.faBack === 'number') ? hist.state.faBack : 0;

  function count(id) {
    var n = 0;
    for (var i = 0; i < entries.length; i++) if (entries[i] === id) n++;
    return n;
  }

  // Remove do fim as entradas órfãs (donos que já reduziram o depth) e devolve quantas eram.
  function dropOrphanTail() {
    var n = 0;
    while (entries.length && entries[entries.length - 1] === null) { entries.pop(); n++; }
    return n;
  }

  function goBack(n) {
    suppress++;
    hist.go(-n);
  }

  function sync() {
    if (suppress > 0) return; // retomado quando o popstate suprimido chegar
    var ids = Object.keys(owners);
    // 1) donos com entradas demais: as mais recentes deles viram órfãs
    ids.forEach(function (id) {
      var extra = count(id) - owners[id].depth;
      for (var i = entries.length - 1; i >= 0 && extra > 0; i--) {
        if (entries[i] === id) { entries[i] = null; extra--; }
      }
    });
    // 2) órfãs no topo saem do histórico de verdade (as do meio ficam e são puladas no voltar)
    var n = dropOrphanTail();
    if (n) { goBack(n); return; }
    // 3) donos com entradas de menos: empilha
    ids.forEach(function (id) {
      for (var c = count(id); c < owners[id].depth; c++) {
        entries.push(id);
        hist.pushState({ faBack: base + entries.length }, '');
      }
    });
  }

  function onPop(e) {
    if (suppress > 0) { suppress--; sync(); return; }
    var pos = (e.state && typeof e.state.faBack === 'number') ? e.state.faBack - base : 0;
    if (pos < 0) pos = 0; // entrada antiga de antes de um reload: tratamos como a raiz
    if (pos > entries.length) { goBack(pos - entries.length); return; } // "avançar" para entrada que já não existe
    var popped = [];
    while (entries.length > pos) popped.push(entries.pop());
    var skip = dropOrphanTail(); // caiu numa órfã: pula direto para a próxima entrada válida
    if (skip) goBack(skip);
    popped.forEach(function (id) {
      if (id && owners[id]) {
        try { owners[id].onBack(); } catch (err) { if (w.console) w.console.error(err); }
      }
    });
    // onBack que não reduziu o depth deixa a pilha curta: reempilha.
    clearTimeout(timer);
    timer = setTimeout(sync, 0);
  }

  w.addEventListener('popstate', onPop);

  w.faBack = {
    use: function (id, onBack) {
      owners[id] = owners[id] || { depth: 0, onBack: onBack };
      owners[id].onBack = onBack;
      return function setDepth(depth) {
        owners[id].depth = Math.max(0, depth | 0);
        sync();
      };
    }
  };
})(window);
