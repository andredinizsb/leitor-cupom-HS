// Regras do controle de refeições (tela /gestao/despesas/refeicoes/ e testes do emulador).
// - Almoço e janta: teto R$ 45 por refeição. Café da manhã: teto R$ 13. Conferidos pela MÉDIA de cada colaborador no período.
// - Itens da mesma nota (dia + fornecedor + NF, ou lançados no mesmo minuto) = uma refeição só.
// - Bebida / alimento (Água, Mercado-alimentício) da mesma nota, ou de outra nota no mesmo dia e dos mesmos colaboradores,
//   entra na refeição do dia lançada mais perto no horário (o Jotform não guarda a hora da nota: vale a hora do lançamento).
// - Lanche no dia de uma refeição entra nela; com almoço e janta no dia, vai para a de menor valor (sem almoço/janta, vai para o café).
// - Dia só com mercado/alimentício e/ou lanche (nenhuma refeição dos mesmos colaboradores): soma tudo e conta como UMA refeição, teto R$ 45.
(function (raiz) {
  "use strict";
  var TETO = 45, TETO_CAFE = 13;
  var ALIM = /agua|água|coca|refri|refrigerante|suco|salgad|lanche|cafe|café|pao|pão|biscoit|bolach|chocolate|sorvete|energetic|cha |chá|leite|iogurte|fruta|bala|doce|cerveja|guarana|guaraná|sanduiche|pastel|coxinha|bolo|amendoim/i;
  function n1(v) { return String(Math.round(v * 10) / 10).replace(".", ","); }
  function nota(x) { return x.data + "|" + (x.fornecedor || "").toLowerCase() + "|" + (x.nf ? "nf" + x.nf : String(x.enviado || "").slice(0, 16)); }
  function minutos(x) { var t = Date.parse(String(x.enviado || "").replace(" ", "T")); return isNaN(t) ? 0 : t / 6e4; }
  function mesmaTurma(a, b) { if (!a.length || !b.length) return true; return a.some(function (c) { return b.indexOf(c) >= 0; }); }
  function ehRefeicao(t) { return /refei/i.test(t || ""); }
  function ehPrincipal(t) { return /almo|jant/i.test(t || ""); }
  function ehCafe(t) { return ehRefeicao(t) && !ehPrincipal(t) && /caf/i.test(t || ""); }
  function ehLanche(t) { return /lanche/i.test(t || ""); }
  function ehMercado(t) { return /mercado|aliment/i.test(t || ""); }
  function ehAlimento(t) { return ehLanche(t) || ehMercado(t) || /água|agua|bebida/i.test(t || ""); }
  function textoAlim(a) { return ALIM.test((a.obs || "") + " " + (a.descricao || "") + " " + a.tipo); }
  function porPessoa(m) { return m.base / (m.colaboradores.length || 1); }

  function montar(todas) {
    var R = {}, refs = [], alim = [];
    todas.forEach(function (x) {
      if (ehRefeicao(x.tipo)) {
        var k = nota(x) + "|" + x.colaboradores.slice().sort().join(",");
        if (!R[k]) { R[k] = Object.assign({}, x, { valor: 0, base: 0, linhas: [], extras: [], colaboradores: x.colaboradores.slice() }); refs.push(R[k]); }
        R[k].valor += x.valor; R[k].base += x.valor; R[k].linhas.push(x);
        if (ehPrincipal(x.tipo) && !ehPrincipal(R[k].tipo)) R[k].tipo = x.tipo;
      } else if (ehAlimento(x.tipo)) alim.push(x);
    });
    refs.forEach(function (m) { if (m.linhas.length > 1) m.qtd = ""; });   // vários itens de uma nota: a quantidade de cada item não é nº de refeições
    function doDia(a) { return refs.filter(function (m) { return m.data === a.data && mesmaTurma(m.colaboradores, a.colaboradores); }); }
    var sobras = [];
    alim.forEach(function (a) {
      var mesmaNota = refs.filter(function (m) { return nota(m) === nota(a); })[0], alvo = mesmaNota, dia = doDia(a);
      if (!alvo && ehLanche(a.tipo)) {
        var p = dia.filter(function (m) { return ehPrincipal(m.tipo); });
        if (!p.length) p = dia;
        p.sort(function (x, y) { return porPessoa(x) - porPessoa(y) || minutos(x) - minutos(y); });
        alvo = p[0];
      } else if (!alvo && textoAlim(a)) {
        dia.sort(function (p, q) { return Math.abs(minutos(p) - minutos(a)) - Math.abs(minutos(q) - minutos(a)); });
        alvo = dia[0];
      }
      if (alvo) { alvo.valor += a.valor; alvo.extras.push(Object.assign({ mesmaNota: !!mesmaNota }, a)); }
      else if (!dia.length) sobras.push(a);   // com refeição no dia e sem cara de alimento: fica fora do controle (como antes)
    });
    // dia sem nenhuma refeição: mercado/lanche (e a bebida junto) somados viram UMA refeição; bebida sozinha fica fora da média
    var grupos = {}, ordem = [];
    sobras.forEach(function (a) {
      var k = a.data + "|" + a.colaboradores.slice().sort().join(",");
      if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
      grupos[k].push(a);
    });
    ordem.forEach(function (k) {
      var g = grupos[k];
      if (g.some(function (a) { return ehMercado(a.tipo) || ehLanche(a.tipo); })) {
        var v = g.reduce(function (s, a) { return s + a.valor; }, 0);
        refs.push(Object.assign({}, g[0], { tipo: "Mercado/lanche sem refeição (conta como refeição)", valor: v, base: v, qtd: "", linhas: g, extras: [], agrupada: true }));
      } else g.forEach(function (a) {
        if (textoAlim(a)) refs.push(Object.assign({}, a, { tipo: "Alimento sem refeição no dia", base: a.valor, linhas: [a], extras: [], solto: true }));
      });
    });
    return refs;
  }

  function tetoDe(x) { if (x.solto) return 0; if (x.agrupada || ehPrincipal(x.tipo)) return TETO; if (ehCafe(x.tipo)) return TETO_CAFE; return 0; }
  // uma refeição -> parte de cada colaborador
  function dividir(x) {
    var nc = x.colaboradores.length, q = parseFloat(String(x.qtd || "").replace(",", ".")) || 1;
    // quantidade com o valor digitado no lugar (ex.: 259,5) ou fora de proporção: vale o nº de colaboradores
    if (Math.abs(q - x.valor) < 0.01 || q > Math.max(nc, 1) * 4) q = nc || 1;
    var teto = tetoDe(x), cafe = teto === TETO_CAFE, porP = 1, pessoas = nc || Math.max(1, Math.round(q)), problema = "";
    if (!nc) problema = "Sem colaborador: não dá para saber de quem é";
    else if (q > nc && Math.abs(q / nc - Math.round(q / nc)) < 0.001) porP = Math.round(q / nc);
    else if (Math.abs(q - nc) > 0.001 && q > 1) problema = "Quantidade (" + n1(q) + ") não fecha com " + nc + " colaborador(es)";
    var parte = x.valor / pessoas, porRef = parte / porP;
    if (x.solto) { problema = ""; porRef = parte; }
    return { parte: parte, porRef: porRef, refeicoes: x.solto ? 0 : porP, teto: teto, comTeto: teto > 0, cafe: cafe, acima: teto > 0 && porRef > teto + 0.005,
      excesso: teto > 0 ? Math.max(0, porRef - teto) * porP : 0, pessoas: pessoas, problema: problema };
  }

  // totais por colaborador: excesso só quando a MÉDIA passa do teto (almoço/janta e café conferidos separados)
  function resumir(D) {
    var porColab = {}, R = [], tot = 0, refs = 0, acima = 0, exc = 0, rt = 0, tt = 0;
    D.forEach(function (x) {
      var d = dividir(x); tot += x.valor;
      if (d.problema) R.push({ x: x, d: d });
      (x.colaboradores.length ? x.colaboradores : ["(sem colaborador)"]).forEach(function (c) {
        var p = porColab[c] = porColab[c] || { nome: c, refeicoes: 0, total: 0, acima: 0, refTeto: 0, totTeto: 0, refCafe: 0, totCafe: 0, dias: {}, itens: [] };
        p.refeicoes += d.refeicoes; p.total += d.parte; if (d.acima) p.acima++;
        if (d.comTeto && d.cafe) { p.refCafe += d.refeicoes; p.totCafe += d.parte; }
        else if (d.comTeto) { p.refTeto += d.refeicoes; p.totTeto += d.parte; }
        p.dias[x.data] = (p.dias[x.data] || 0) + (d.comTeto && !d.cafe ? d.refeicoes : 0); p.itens.push({ x: x, d: d });
      });
      refs += d.refeicoes * d.pessoas;
    });
    Object.keys(porColab).forEach(function (k) {
      var p = porColab[k];
      p.media = p.refTeto ? p.totTeto / p.refTeto : 0; p.mediaCafe = p.refCafe ? p.totCafe / p.refCafe : 0;
      p.excessoRef = Math.max(0, p.totTeto - TETO * p.refTeto); p.excessoCafe = Math.max(0, p.totCafe - TETO_CAFE * p.refCafe);
      p.excesso = p.excessoRef + p.excessoCafe;
      if (p.excesso > 0.005) acima++; exc += p.excesso; rt += p.refTeto; tt += p.totTeto;
    });
    return { porColab: porColab, R: R, tot: tot, refs: refs, acima: acima, exc: exc, rt: rt, tt: tt };
  }

  raiz.HSRefeicoes = { TETO: TETO, TETO_CAFE: TETO_CAFE, montar: montar, dividir: dividir, resumir: resumir };
})(typeof window !== "undefined" ? window : globalThis);
