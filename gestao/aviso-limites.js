// Faixa de aviso nas telas da gestão: aparece quando algum teto do plano grátis (D1/R2) passa de 80%.
(function () {
  fetch("/api/gestao/limites", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.ok || !j.avisos || !j.avisos.length) return;
    var d = document.createElement("div");
    d.setAttribute("role", "status");
    d.style.cssText = "margin:0;padding:10px 16px;font:14px/1.4 Inter,system-ui,sans-serif;color:#0E1217;background:" + (j.cheio ? "#FFB3B3" : "#FFE500") + ";border-bottom:2px solid #0E1217";
    d.innerHTML = "<b>" + (j.cheio ? "Espaço grátis do app CHEIO — fotos novas não estão sendo salvas." : "Espaço grátis do app perto do limite.") + "</b> " +
      j.avisos.map(function (a) { return a.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }).join(" · ") +
      ". Rode a macro <b>ArquivarFotosApp</b> na planilha (guarda no servidor e libera espaço).";
    document.body.insertBefore(d, document.body.firstChild);
  }).catch(function () {});
})();
