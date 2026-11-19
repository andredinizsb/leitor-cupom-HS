// HS Gestão · campo "Obra" com lista suspensa (cadastro oficial obras.json, gerado pela planilha) que também aceita digitar obra nova.
// Uso: HSObras.ligar(input, function (obraOuNull) { ... })  ·  HSObras.carregar().then(function (lista) { ... })
(function () {
  "use strict";
  var cache = null, temCss = false;
  function carregar() {
    if (!cache) cache = fetch("/obras.json", { cache: "no-cache" }).then(function (r) { return r.json(); })
      .then(function (j) { return Array.isArray(j) ? j : []; }).catch(function () { return []; });
    return cache;
  }
  function norm(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function estilo() {
    if (temCss) return; temCss = true;
    var s = document.createElement("style");
    s.textContent = ".hsob{position:relative}.hsob>input{padding-right:46px}" +
      ".hsob-bt{position:absolute;right:4px;top:4px;bottom:4px;width:38px;border:0;border-radius:8px;background:transparent;color:var(--mut,#5C6577);font-size:18px;cursor:pointer}" +
      ".hsob-l{position:absolute;left:0;right:0;top:100%;z-index:40;margin-top:4px;max-height:300px;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--card,#fff);border:1px solid var(--bd,#DFE3EA);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.22)}" +
      ".hsob-l button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--bd,#DFE3EA);background:transparent;color:var(--tx,#14171C);font:inherit;font-size:15px;padding:9px 12px;min-height:48px;cursor:pointer}" +
      ".hsob-l button:last-child{border-bottom:0}.hsob-l button:active,.hsob-l button.on{background:color-mix(in srgb,var(--pri,#0071A3) 12%,transparent)}" +
      ".hsob-l b{font-weight:800}.hsob-l .e{display:inline-block;font-size:11px;font-weight:800;border-radius:6px;padding:1px 6px;margin-left:6px;color:#fff;background:#0071A3}.hsob-l .e.MC{background:#1B7F3A}" +
      ".hsob-l small{display:block;color:var(--mut,#5C6577);font-size:13px;line-height:1.3;margin-top:2px}.hsob-l .info{padding:10px 12px;color:var(--mut,#5C6577);font-size:13px}";
    document.head.appendChild(s);
  }
  function ligar(inp, aoEscolher) {
    if (!inp || inp.getAttribute("data-hsob")) return;
    inp.setAttribute("data-hsob", "1"); inp.removeAttribute("list"); inp.removeAttribute("inputmode"); inp.setAttribute("autocomplete", "off");
    if (!inp.placeholder || /^Ex\./.test(inp.placeholder) || /lista/.test(inp.placeholder)) inp.placeholder = "Toque para ver a lista ou digite o nº / cliente";
    estilo();
    var caixa = document.createElement("div"); caixa.className = "hsob";
    inp.parentNode.insertBefore(caixa, inp); caixa.appendChild(inp);
    var bt = document.createElement("button"); bt.type = "button"; bt.className = "hsob-bt"; bt.setAttribute("aria-label", "Abrir a lista de obras"); bt.textContent = "▾"; caixa.appendChild(bt);
    var lista = document.createElement("div"); lista.className = "hsob-l"; lista.hidden = true; lista.setAttribute("role", "listbox"); caixa.appendChild(lista);
    var L = [], aberta = false, filtrar = false;
    function achar(v) { v = String(v || "").trim(); return L.filter(function (o) { return String(o.n) === v; })[0] || null; }
    function desenhar() {
      var q = filtrar ? norm(inp.value.trim()) : "";
      var F = L.filter(function (o) { return !q || String(o.n).indexOf(q) === 0 || norm([o.c, o.d].join(" ")).indexOf(q) >= 0; });
      var h = F.map(function (o) {
        return '<button type="button" role="option" data-n="' + esc(o.n) + '"' + (String(o.n) === inp.value.trim() ? ' class="on"' : "") + '><b>' + esc(o.n) + '</b>' +
          (o.e ? '<span class="e ' + esc(o.e) + '">' + esc(o.e) + '</span>' : "") + '<small>' + esc([o.c, o.d].filter(Boolean).join(" · ")) + '</small></button>';
      }).join("");
      if (!L.length) h = '<div class="info">Lista de obras indisponível agora. Digite o número da obra.</div>';
      else if (!F.length) h = '<div class="info">Nenhuma obra em andamento com "' + esc(inp.value.trim()) + '". Se for obra nova, pode continuar digitando.</div>';
      lista.innerHTML = h;
    }
    function abrir(f) { filtrar = !!f; desenhar(); lista.hidden = false; aberta = true; bt.textContent = "▴"; }
    function fechar() { lista.hidden = true; aberta = false; bt.textContent = "▾"; }
    function avisar() { if (aoEscolher) aoEscolher(achar(inp.value)); }
    carregar().then(function (x) { L = x; if (aberta) desenhar(); avisar(); });
    inp.addEventListener("focus", function () { abrir(false); });
    inp.addEventListener("click", function () { if (!aberta) abrir(false); });
    inp.addEventListener("input", function () { abrir(true); avisar(); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });
    bt.addEventListener("mousedown", function (e) { e.preventDefault(); });
    bt.addEventListener("click", function () { if (aberta) fechar(); else { inp.focus(); abrir(false); } });
    // mousedown/touch com preventDefault: o campo não perde o foco antes do toque na opção
    lista.addEventListener("mousedown", function (e) { e.preventDefault(); });
    lista.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-n]"); if (!b) return;
      inp.value = b.getAttribute("data-n"); fechar();
      inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); fechar(); inp.blur();
    });
    document.addEventListener("click", function (e) { if (aberta && !caixa.contains(e.target)) fechar(); });
    inp.addEventListener("blur", function () { setTimeout(function () { if (document.activeElement !== inp) fechar(); }, 150); });
  }
  window.HSObras = { ligar: ligar, carregar: carregar };
})();
