// Faixa de aviso nas telas da gestão: aparece quando algum teto do plano grátis (D1/R2) passa de 80%.
(function () {
  fetch("/api/gestao/limites", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.ok || !j.avisos || !j.avisos.length) return;
    var d = document.createElement("div");
    d.setAttribute("role", "status");
    d.className = "hs-aviso" + (j.cheio ? " cheio" : "");
    d.innerHTML = (window.HSIcone ? '<span style="width:20px;height:20px;flex:none;display:grid">' + window.HSIcone("alerta") + "</span>" : "") + "<span><b>" +
      (j.cheio ? "Espaço grátis do app cheio: fotos novas não estão sendo salvas." : "Espaço grátis do app perto do limite.") + "</b> " +
      j.avisos.map(function (a) { return a.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }).join(" · ") +
      ". Rode a macro <b>ArquivarFotosApp</b> na planilha (guarda no servidor e libera espaço).</span>";
    var m = document.querySelector("main");
    if (m && m.parentNode) m.parentNode.insertBefore(d, m); else document.body.insertBefore(d, document.body.firstChild);
  }).catch(function () {});
})();
