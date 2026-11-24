// HS Gestão · casca do escritório: menu lateral (computador) / gaveta (celular), usuário e tema.
// Uso: primeira coisa do <body data-mod="rdo">:  <script src="/ds/shell.js?v=1"></script>
// Cria o #quem (as telas escrevem o e-mail de quem entrou nele) e expõe window.HSIcone(nome) para as telas.
(function () {
  "use strict";
  var P = {
    painel: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    autorizacoes: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    rdo: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    checklist: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    frota: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    documentos: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    pedidos: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
    compras: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    despesas: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    apps: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    lua: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    auto: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    seta: '<path d="m9 18 6-6-6-6"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    atualizar: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    mais: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    pdf: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>'
  };
  function icone(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || "") + "</svg>"; }
  window.HSIcone = icone;

  // tema: sistema (padrão) / claro / escuro — guardado neste aparelho
  var raiz = document.documentElement, LS = "hsTema";
  function tema(t) { if (t === "light" || t === "dark") raiz.setAttribute("data-theme", t); else raiz.removeAttribute("data-theme"); }
  try { tema(localStorage.getItem(LS)); } catch (e) {}

  var MENU = [
    ["Visão geral", [["painel", "Painel", "/gestao/painel/"]]],
    ["Compras", [["compras", "Requisições", "/gestao/compras/"], ["pedidos", "Pedidos de compra", "/gestao/compras/pedidos/"], ["autorizacoes", "Autorizações (canhotos)", "/gestao/"]]],
    ["Operação", [["rdo", "RDOs", "/gestao/rdo/"], ["checklist", "Checklists", "/gestao/checklist/"]]],
    ["Frota", [["frota", "Manutenções e pendências", "/gestao/frota/"], ["documentos", "Documentos", "/gestao/frota/documentos/"]]],
    ["Financeiro", [["despesas", "Despesas", "/gestao/despesas/"]]]
  ];
  var b = document.body, mod = b.getAttribute("data-mod") || "", nome = "Gestão";
  b.classList.add("hs-app");
  var nav = MENU.map(function (g) {
    return '<div class="grp">' + g[0] + "</div>" + g[1].map(function (i) {
      if (i[0] === mod) nome = i[1];
      return '<a href="' + i[2] + '"' + (i[0] === mod ? ' aria-current="page"' : "") + ">" + icone(i[0]) + "<span>" + i[1] + '</span><span class="cont" data-cont="' + i[0] + '" hidden></span></a>';
    }).join("");
  }).join("") + '<div class="grp">Campo</div><a href="/inicio/">' + icone("apps") + "<span>Apps de campo</span></a>";

  var side = document.createElement("aside");
  side.className = "hs-side"; side.id = "hsSide"; side.setAttribute("aria-label", "Menu da gestão");
  side.innerHTML = '<a class="hs-marca" href="/gestao/painel/"><img src="/icons/gestao.svg" alt=""><span><b>HS Gestão</b><small>Escritório · Suprimentos</small></span></a>' +
    '<nav class="hs-nav">' + nav + "</nav>" +
    '<div class="hs-pe"><div class="hs-user"><span class="av" id="hsAv" aria-hidden="true">HS</span><span style="min-width:0"><span class="quem" id="quem"></span><small>Login HS (Cloudflare Access)</small></span></div>' +
    '<div class="hs-tema" role="group" aria-label="Tema"><button type="button" data-t="">' + icone("auto") + 'Sistema</button><button type="button" data-t="light">' + icone("sol") + 'Claro</button><button type="button" data-t="dark">' + icone("lua") + "Escuro</button></div></div>";
  var top = document.createElement("div");
  top.className = "hs-top";
  top.innerHTML = '<button type="button" id="hsMenu" aria-label="Abrir menu" aria-controls="hsSide" aria-expanded="false">' + icone("menu") + '</button><img src="/icons/gestao.svg" alt=""><b>' + nome + "</b>";
  var veu = document.createElement("div"); veu.className = "hs-veu";
  b.insertBefore(veu, b.firstChild); b.insertBefore(side, b.firstChild); b.insertBefore(top, veu);

  function gaveta(abrir) {
    side.classList.toggle("aberta", abrir); veu.classList.toggle("on", abrir);
    top.querySelector("#hsMenu").setAttribute("aria-expanded", abrir ? "true" : "false");
    if (abrir) { var a = side.querySelector("[aria-current]") || side.querySelector("a"); if (a) a.focus(); }
  }
  top.querySelector("#hsMenu").addEventListener("click", function () { gaveta(true); });
  veu.addEventListener("click", function () { gaveta(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && side.classList.contains("aberta")) { gaveta(false); top.querySelector("#hsMenu").focus(); } });

  var tb = side.querySelectorAll(".hs-tema button");
  function marcar() { var t = raiz.getAttribute("data-theme") || ""; tb.forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-t") === t ? "true" : "false"); }); }
  tb.forEach(function (x) { x.addEventListener("click", function () { var t = x.getAttribute("data-t"); tema(t); try { if (t) localStorage.setItem(LS, t); else localStorage.removeItem(LS); } catch (e) {} marcar(); }); });
  marcar();

  // iniciais do usuário quando a tela preencher o #quem
  var q = side.querySelector("#quem");
  new MutationObserver(function () { var s = (q.textContent || "").split("@")[0].split(/[._-]+/).filter(Boolean); document.getElementById("hsAv").textContent = (s.length ? (s[0][0] + (s[1] ? s[1][0] : "")) : "HS").toUpperCase(); })
    .observe(q, { childList: true, characterData: true, subtree: true });

  // contadores no menu: autorizações pendentes e requisições novas (guardados 2 min nesta aba)
  function cont(chave, n) { var e = side.querySelector('[data-cont="' + chave + '"]'); if (e && n > 0) { e.textContent = n; e.hidden = false; e.title = n + " pendente(s)"; } }
  function contador(chave, url, ler) {
    var K = "hsCont_" + chave, c = null;
    try { c = JSON.parse(sessionStorage.getItem(K) || "null"); } catch (e) {}
    if (c && Date.now() - c.t < 12e4) return cont(chave, c.n);
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      var n = ler(j) || 0; cont(chave, n);
      try { sessionStorage.setItem(K, JSON.stringify({ t: Date.now(), n: n })); } catch (e) {}
    }).catch(function () {});
  }
  contador("autorizacoes", "/api/gestao/autorizacoes?status=todas", function (j) { return j && j.contagem && j.contagem.Pendente; });
  contador("compras", "/api/gestao/compras?situacao=Nova", function (j) { return j && j.contagem && j.contagem.Nova; });
  contador("pedidos", "/api/gestao/compras-pedido", function (j) { return j && j.contagem && j.contagem["Aguardando aprovação"]; });
})();
