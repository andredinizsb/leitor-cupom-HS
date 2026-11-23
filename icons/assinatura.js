// HS Gestão · tela de assinatura (confirmação do RDO, do checklist e da aprovação da gestão).
// Uso: hsAssinar({ app, titulo, sub, nome, linhas: [[rótulo, valor]], confirmar, voltar, ok: function (pngDataUrl) {}, cancelar: function () {} })
(function () {
  var CSS = ".hs-as{--as-bg:#F4F6F8;--as-card:#fff;--as-txt:#0E1217;--as-sub:#5A6472;--as-borda:#D5DCE3;--as-pri:#0071A3}" +
    "@media (prefers-color-scheme:dark){.hs-as{--as-bg:#0E1217;--as-card:#171D25;--as-txt:#EEF2F6;--as-sub:#9AA5B3;--as-borda:#2B3645;--as-pri:#33C0FF}}" +
    ".hs-as{position:fixed;inset:0;z-index:9997;background:var(--as-bg);color:var(--as-txt);overflow-y:auto;display:flex;justify-content:center;" +
    "padding:calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));font:16px/1.45 Inter,system-ui,sans-serif}" +
    ".hs-as .in{width:100%;max-width:520px;margin:auto 0}" +
    ".hs-as .app{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--as-sub);margin-bottom:10px}.hs-as .app img{width:28px;height:28px;border-radius:7px}" +
    ".hs-as h2{margin:0 0 4px;font-size:22px;line-height:28px}.hs-as .sub{margin:0 0 12px;color:var(--as-sub);font-size:14px}" +
    ".hs-as dl{margin:0 0 12px;background:var(--as-card);border:1px solid var(--as-borda);border-radius:12px;padding:2px 12px}" +
    ".hs-as dl div{display:flex;gap:10px;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--as-borda);font-size:14px}.hs-as dl div:last-child{border-bottom:0}" +
    ".hs-as dt{color:var(--as-sub)}.hs-as dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere}" +
    ".hs-as .pad{position:relative;background:#fff;border:2px dashed var(--as-borda);border-radius:12px;touch-action:none}" +
    ".hs-as canvas{display:block;width:100%;height:200px;cursor:crosshair}" +
    ".hs-as .linha{position:absolute;left:16px;right:16px;bottom:44px;border-top:1px solid #9AA5B3;pointer-events:none}" +
    ".hs-as .dica{position:absolute;left:0;right:0;bottom:14px;text-align:center;font-size:13px;color:#8A95A3;pointer-events:none}" +
    ".hs-as .nome{margin:8px 0 0;font-size:14px;color:var(--as-sub);text-align:center}.hs-as .err{color:#C81E1E;font-size:14px;margin:8px 0 0;min-height:20px;text-align:center}" +
    ".hs-as .bts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}" +
    ".hs-as button{min-height:48px;border-radius:10px;font:600 15px Inter,system-ui,sans-serif;cursor:pointer;border:1px solid var(--as-borda);background:var(--as-card);color:var(--as-pri)}" +
    ".hs-as button.pri{grid-column:1/-1;background:var(--as-pri);border-color:var(--as-pri);color:#fff;min-height:52px;font-size:16px}";
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function val(v) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(v || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] + " " + m[4] + ":" + m[5] : v; }

  window.hsAssinar = function (o) {
    if (!document.getElementById("hsAsCss")) { var s = document.createElement("style"); s.id = "hsAsCss"; s.textContent = CSS; document.head.appendChild(s); }
    var d = document.createElement("section"); d.className = "hs-as"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", o.titulo || "Assinatura");
    var linhas = (o.linhas || []).filter(function (l) { return l && l[1] != null && String(l[1]).trim() !== ""; });
    d.innerHTML = '<div class="in">' + (o.app ? '<div class="app"><img src="/icons/' + esc(o.app) + '.svg" alt="">HS Gestão</div>' : "") +
      "<h2>" + esc(o.titulo || "Assinatura") + "</h2>" + (o.sub ? '<p class="sub">' + esc(o.sub) + "</p>" : "") +
      (linhas.length ? "<dl>" + linhas.map(function (l) { return "<div><dt>" + esc(l[0]) + "</dt><dd>" + esc(val(l[1])) + "</dd></div>"; }).join("") + "</dl>" : "") +
      '<div class="pad"><canvas></canvas><div class="linha"></div><div class="dica">Assine aqui com o dedo</div></div>' +
      (o.nome ? '<p class="nome">' + esc(o.nome) + "</p>" : "") + '<p class="err"></p>' +
      '<div class="bts"><button type="button" class="pri" data-a="ok">' + esc(o.confirmar || "Assinar e confirmar") + '</button>' +
      '<button type="button" data-a="limpar">Limpar</button><button type="button" data-a="voltar">' + esc(o.voltar || "Voltar e editar") + "</button></div></div>";
    document.documentElement.style.overflow = "hidden";
    document.body.appendChild(d);
    var cv = d.querySelector("canvas"), ctx = cv.getContext("2d"), riscou = false, desenhando = false, ult = null;
    function ajustar() {
      var r = cv.getBoundingClientRect(), k = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * k); cv.height = Math.round(r.height * k);
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0E1217";
      riscou = false; d.querySelector(".dica").style.display = "";
    }
    ajustar();
    function pt(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    cv.addEventListener("pointerdown", function (e) { e.preventDefault(); desenhando = true; ult = pt(e); try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
    cv.addEventListener("pointermove", function (e) {
      if (!desenhando) return; e.preventDefault();
      var p = pt(e); ctx.beginPath(); ctx.moveTo(ult.x, ult.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ult = p;
      if (!riscou) { riscou = true; d.querySelector(".dica").style.display = "none"; d.querySelector(".err").textContent = ""; }
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { cv.addEventListener(ev, function () { desenhando = false; }); });
    function fechar() { if (d.parentNode) d.parentNode.removeChild(d); document.documentElement.style.overflow = ""; }
    d.querySelector(".bts").addEventListener("click", function (e) {
      var a = e.target.getAttribute("data-a");
      if (a === "limpar") { ctx.clearRect(0, 0, cv.width, cv.height); ajustar(); }
      else if (a === "voltar") { fechar(); if (o.cancelar) o.cancelar(); }
      else if (a === "ok") {
        if (!riscou) { d.querySelector(".err").textContent = "Faça a assinatura no quadro antes de confirmar."; return; }
        // reduz para no máx. 600 px de largura (a assinatura fica leve no banco)
        var esc2 = Math.min(1, 600 / cv.width), out = document.createElement("canvas");
        out.width = Math.round(cv.width * esc2); out.height = Math.round(cv.height * esc2);
        var c2 = out.getContext("2d"); c2.fillStyle = "#fff"; c2.fillRect(0, 0, out.width, out.height); c2.drawImage(cv, 0, 0, out.width, out.height);
        var png = out.toDataURL("image/png");
        fechar(); if (o.ok) o.ok(png);
      }
    });
  };
})();
