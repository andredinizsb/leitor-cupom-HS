// HS Gestão · tela pós-envio (RDO, checklist, autorização) — mesmo espírito da tela de sucesso do Despesas.
// Uso: hsEnviado({ app, titulo, numero, sub, linhas: [[rótulo, valor]], aviso, alerta, compartilhar, botoes: [{ txt, primario, fn }] })
(function () {
  var CSS = ".hs-ok{--ok-bg:#F4F6F8;--ok-card:#fff;--ok-txt:#0E1217;--ok-sub:#5A6472;--ok-borda:#E2E6EB;--ok-pri:#0071A3;--ok-verde:#12805C;--ok-verde-sub:#DDF3EA;--ok-alerta:#B45309;--ok-alerta-sub:#FEF3C7}" +
    "@media (prefers-color-scheme:dark){.hs-ok{--ok-bg:#0E1217;--ok-card:#171D25;--ok-txt:#EEF2F6;--ok-sub:#9AA5B3;--ok-borda:#263040;--ok-pri:#33C0FF;--ok-verde:#4ADE9A;--ok-verde-sub:#0F3A2A;--ok-alerta:#FBBF24;--ok-alerta-sub:#3A2A08}}" +
    ".hs-ok{position:fixed;inset:0;z-index:9998;background:var(--ok-bg);color:var(--ok-txt);overflow-y:auto;display:flex;justify-content:center;" +
    "padding:calc(20px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom));font:16px/1.45 Inter,system-ui,sans-serif}" +
    ".hs-ok .in{width:100%;max-width:440px;margin:auto 0;text-align:center}" +
    ".hs-ok .app{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:600;color:var(--ok-sub);margin-bottom:18px}.hs-ok .app img{width:28px;height:28px;border-radius:7px}" +
    ".hs-ok .chk{width:76px;height:76px;border-radius:50%;background:var(--ok-verde-sub);color:var(--ok-verde);display:grid;place-items:center;margin:0 auto 16px}" +
    ".hs-ok.alerta .chk{background:var(--ok-alerta-sub);color:var(--ok-alerta)}" +
    ".hs-ok h2{margin:0 0 4px;font-size:24px;line-height:32px;font-weight:700}" +
    ".hs-ok .num{font-size:26px;line-height:34px;font-weight:800;letter-spacing:-.01em;margin:2px 0 6px;font-variant-numeric:tabular-nums}" +
    ".hs-ok .sub{color:var(--ok-sub);margin:0 0 18px}" +
    ".hs-ok dl{margin:0 0 16px;text-align:left;background:var(--ok-card);border:1px solid var(--ok-borda);border-radius:12px;padding:4px 14px}" +
    ".hs-ok dl div{display:flex;gap:12px;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--ok-borda)}.hs-ok dl div:last-child{border-bottom:0}" +
    ".hs-ok dt{color:var(--ok-sub);font-size:14px;flex:0 0 auto}.hs-ok dd{margin:0;font-weight:600;font-size:15px;text-align:right;overflow-wrap:anywhere}" +
    ".hs-ok .av{background:var(--ok-alerta-sub);color:var(--ok-alerta);border-radius:10px;padding:10px 12px;font-size:14px;text-align:left;margin:0 0 16px}" +
    ".hs-ok button,.hs-ok a.bt{display:block;width:100%;min-height:50px;border-radius:10px;font:600 16px Inter,system-ui,sans-serif;cursor:pointer;margin:8px 0 0;text-decoration:none;line-height:50px;border:1px solid var(--ok-borda);background:var(--ok-card);color:var(--ok-pri)}" +
    ".hs-ok button.pri{background:var(--ok-pri);border-color:var(--ok-pri);color:#fff}" +
    ".hs-ok a.todos{display:inline-block;margin-top:14px;color:var(--ok-pri);font-weight:600;font-size:14px;text-decoration:none;min-height:44px;line-height:44px}";
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function val(v) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(v || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] + ":" + m[5] : v; }

  window.hsEnviado = function (o) {
    if (!document.getElementById("hsOkCss")) { var s = document.createElement("style"); s.id = "hsOkCss"; s.textContent = CSS; document.head.appendChild(s); }
    var velho = document.querySelector(".hs-ok"); if (velho) velho.parentNode.removeChild(velho);
    var d = document.createElement("section");
    d.className = "hs-ok" + (o.alerta ? " alerta" : ""); d.setAttribute("role", "dialog"); d.setAttribute("aria-label", o.titulo || "Enviado");
    var linhas = (o.linhas || []).filter(function (l) { return l && l[1] != null && String(l[1]).trim() !== ""; });
    var icone = o.alerta ? '<path d="M12 8v5M12 16.5v.5" stroke-width="2.4"/><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>'
      : '<path d="M20 6 9 17l-5-5" stroke-width="2.6"/>';
    d.innerHTML = '<div class="in">' +
      (o.app ? '<div class="app"><img src="/icons/' + esc(o.app) + '.svg" alt="">HS Gestão</div>' : "") +
      '<div class="chk"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' + icone + "</svg></div>" +
      "<h2>" + esc(o.titulo || "Enviado") + "</h2>" + (o.numero ? '<div class="num">' + esc(o.numero) + "</div>" : "") +
      (o.sub ? '<p class="sub">' + esc(o.sub) + "</p>" : '<p class="sub"></p>') +
      (linhas.length ? "<dl>" + linhas.map(function (l) { return "<div><dt>" + esc(l[0]) + "</dt><dd>" + esc(val(l[1])) + "</dd></div>"; }).join("") + "</dl>" : "") +
      (o.aviso ? '<div class="av">' + esc(o.aviso) + "</div>" : "") +
      '<div class="bts"></div><a class="todos" href="/inicio/">Todos os apps</a></div>';
    var bts = d.querySelector(".bts");
    function fechar() { if (d.parentNode) d.parentNode.removeChild(d); document.documentElement.style.overflow = ""; window.scrollTo(0, 0); }
    (o.botoes || [{ txt: "Fechar", primario: true }]).forEach(function (b) {
      var e = document.createElement("button"); e.type = "button"; e.textContent = b.txt; if (b.primario) e.className = "pri";
      e.addEventListener("click", function () { fechar(); if (b.fn) b.fn(); });
      bts.appendChild(e);
    });
    if (o.compartilhar) {
      var c = document.createElement("button"); c.type = "button"; c.textContent = "Compartilhar resumo";
      c.addEventListener("click", function () {
        if (navigator.share) navigator.share({ text: o.compartilhar }).catch(function () {});
        else window.open("https://wa.me/?text=" + encodeURIComponent(o.compartilhar), "_blank", "noopener");
      });
      bts.appendChild(c);
    }
    document.documentElement.style.overflow = "hidden";
    document.body.appendChild(d);
    var p = bts.querySelector("button"); if (p) p.focus();
    if (navigator.vibrate) try { navigator.vibrate(o.alerta ? [60, 60, 60] : 40); } catch (e) {}
  };
})();
