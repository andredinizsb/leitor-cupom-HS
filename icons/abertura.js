// HS Gestão · tela de abertura + ícone do app no topo (todas as telas, menos o Despesas, que já tem a sua).
// Uso no fim do <body>: <script src="/icons/abertura.js" data-app="rdo"></script>
// Apps de campo (autorizacao, rdo, checklist): abertura com "Começar", como no Despesas.
// Escritório (hub, gestao, frota): abertura rápida que some sozinha. Aparece uma vez por sessão (até fechar o app).
(function () {
  var s = document.currentScript, id = (s && s.getAttribute("data-app")) || "hub";
  var A = {
    hub: { t: "HS Gestão", lead: "Os apps da HS Eletricidade e da MC Manutenções em um só lugar: campo e escritório.", entrar: "Entrar", inicio: true,
      itens: [["Campo", "Despesas, autorização, RDO e checklist do veículo"], ["Escritório", "Autorizações, RDOs, checklists e frota"], ["Tudo guardado", "Relatórios em PDF no servidor da empresa"]] },
    autorizacao: { t: "Autorização", lead: "Peça autorização de abastecimento ou material e receba o canhoto no celular.",
      itens: [["Peça", "Abastecimento ou material, com a obra e o motivo"], ["Acompanhe", "Veja na hora quando for liberada"], ["Canhoto", "Baixe o PDF ou envie pelo WhatsApp"]] },
    rdo: { t: "RDO · Diário de Obra", lead: "Lance o relatório do dia da obra: equipe, veículo, atividades e fotos.",
      itens: [["Equipe e veículo", "Colaboradores, veículo e km do dia"], ["Atividades", "O que foi feito, materiais e ocorrências"], ["Fotos", "Antes, durante e depois, com data e obra na foto"]] },
    checklist: { t: "Checklist do veículo", lead: "Confira o veículo antes de sair: itens de segurança, avarias e fotos.",
      itens: [["Segurança", "Marque o que está OK e o que tem problema"], ["Avarias", "Frente, laterais e traseira, com foto"], ["Oficina", "Os problemas vão direto para a manutenção"]] },
    gestao: { t: "Gestão · Escritório", lead: "Área do Suprimentos: revise, assine e acompanhe tudo o que vem do campo.",
      itens: [["Painel", "Pendências e números do dia em uma tela"], ["Aprovações", "Autorizações e RDOs para revisar e assinar"], ["Frota e despesas", "Oficina, documentos e custos por obra"]] },
    gdespesas: { t: "Despesas · Gestão", lead: "Custos lançados pelo campo, em um painel: por obra, categoria e mês, com edição das despesas.",
      itens: [["Painel de custos", "Total por obra, categoria e mês"], ["Filtros", "Período, obra, categoria e colaborador"], ["Editar", "Corrija obra, tipo ou valor; fica registrado quem mudou"]] },
    frota: { t: "Frota", lead: "Manutenções, pendências da oficina e documentos dos veículos.",
      itens: [["Manutenções", "Registre com a NF e acompanhe os gastos"], ["Pendências", "O que a oficina precisa resolver"], ["Documentos", "Vencimentos com alerta"]] }
  };
  var a = A[id] || A.hub, ico = "/icons/" + id + ".svg";

  // 1) ícone do app no lugar do "HS" do topo
  var lg = document.querySelector("header .logo");
  if (lg) {
    var im = document.createElement("img"), w = lg.offsetWidth || 32, h = lg.offsetHeight || 32;
    im.src = ico; im.alt = ""; im.width = w; im.height = h;
    im.style.cssText = "display:block;flex:0 0 auto;border-radius:" + Math.round(Math.min(w, h) * 0.22) + "px";
    lg.parentNode.replaceChild(im, lg);
  }

  // 2) tela de abertura
  var K = "hs_abertura_" + id;
  try { if (sessionStorage.getItem(K)) return; } catch (e) {}
  var css = document.createElement("style");
  css.textContent =
    ".hs-ab{--ab-bg:#F4F6F8;--ab-card:#fff;--ab-txt:#0E1217;--ab-sub:#5A6472;--ab-borda:#E2E6EB;--ab-pri:#0071A3;--ab-pri-sub:#E1F1F9}" +
    "@media (prefers-color-scheme:dark){.hs-ab{--ab-bg:#0E1217;--ab-card:#171D25;--ab-txt:#EEF2F6;--ab-sub:#9AA5B3;--ab-borda:#263040;--ab-pri:#33C0FF;--ab-pri-sub:#10324A}}" +
    ".hs-ab{position:fixed;inset:0;z-index:9999;background:var(--ab-bg);color:var(--ab-txt);overflow-y:auto;display:flex;justify-content:center;" +
    "padding:calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));font:16px/1.45 Inter,system-ui,sans-serif;transition:opacity .25s}" +
    ".hs-ab::before{content:'';position:fixed;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,#00A0E7 0 70%,#FE0000 70% 85%,#FFE500 85%)}" +
    ".hs-ab .in{width:100%;max-width:420px;margin:auto 0;display:flex;flex-direction:column;align-items:center;text-align:center}" +
    ".hs-ab .ico{width:96px;height:96px;border-radius:22px;box-shadow:0 8px 24px rgba(14,18,23,.18);margin-bottom:20px}" +
    ".hs-ab .br{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ab-pri)}" +
    ".hs-ab h1{margin:4px 0 8px;font-size:28px;line-height:36px;font-weight:700;letter-spacing:-.02em}" +
    ".hs-ab .ld{margin:0 0 24px;color:var(--ab-sub);text-wrap:balance}" +
    ".hs-ab .ls{width:100%;display:flex;flex-direction:column;gap:8px;margin-bottom:24px;text-align:left}" +
    ".hs-ab .it{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:var(--ab-card);border:1px solid var(--ab-borda)}" +
    ".hs-ab .n{width:36px;height:36px;border-radius:10px;background:var(--ab-pri-sub);color:var(--ab-pri);display:grid;place-items:center;font-weight:700;flex:0 0 auto}" +
    ".hs-ab .it b{display:block;font-size:15px;line-height:20px}.hs-ab .it span{font-size:14px;line-height:20px;color:var(--ab-sub)}" +
    ".hs-ab button{width:100%;min-height:52px;border:0;border-radius:10px;background:var(--ab-pri);color:#fff;font:600 17px Inter,system-ui,sans-serif;cursor:pointer}" +
    ".hs-ab a.vi{display:block;width:100%;min-height:48px;line-height:48px;margin-top:8px;border-radius:10px;border:1px solid var(--ab-borda);background:var(--ab-card);color:var(--ab-pri);font-weight:600;font-size:16px;text-decoration:none}" +
    ".hs-ab .ft{margin-top:20px;font-size:12px;color:var(--ab-sub)}" +
    // tela de início central (hub): sempre clara, com a cara da HS (logo + fios da marca)
    ".hs-ab.hs-hub{background:#fff;color:#0E1217;padding-bottom:calc(150px + env(safe-area-inset-bottom))}.hs-hub::before{height:6px}" +
    ".hs-hub .in{max-width:380px}.hs-hub .logo{width:min(340px,84vw);height:auto;display:block;margin:0 auto}" +
    ".hs-hub .tri{width:92px;height:6px;border-radius:3px;margin:26px auto 18px;background:linear-gradient(90deg,#00A0E7 0 60%,#FE0000 60% 80%,#FFE500 80%)}" +
    ".hs-hub .nm{font-weight:800;font-size:15px;letter-spacing:.28em;color:#0071A3}.hs-hub .tg{margin:6px 0 30px;color:#5A6472;font-size:16px}" +
    ".hs-hub button{border-radius:999px;min-height:56px;max-width:300px;margin:0 auto;display:block;background:#0071A3;font-size:18px;box-shadow:0 8px 22px rgba(0,113,163,.32);letter-spacing:.02em}" +
    ".hs-hub button:active{transform:translateY(1px)}" +
    ".hs-hub .fios{position:fixed;left:0;right:0;bottom:calc(30px + env(safe-area-inset-bottom));width:100%;height:120px;pointer-events:none}" +
    ".hs-hub .rod{position:fixed;left:0;right:0;bottom:calc(10px + env(safe-area-inset-bottom));text-align:center;font-size:12px;letter-spacing:.06em;color:#8A95A3}";
  document.head.appendChild(css);
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var d = document.createElement("section");
  d.className = "hs-ab"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", a.t);
  d.innerHTML = '<div class="in"><img class="ico" src="' + ico + '" alt=""><div class="br">HS Eletricidade · MC Manutenções</div><h1>' + esc(a.t) + '</h1><p class="ld">' + esc(a.lead) + "</p>" +
    (a.itens ? '<div class="ls">' + a.itens.map(function (x, i) { return '<div class="it"><div class="n">' + (i + 1) + "</div><div><b>" + esc(x[0]) + "</b><span>" + esc(x[1]) + "</span></div></div>"; }).join("") + "</div>" : "") +
    (a.rapida ? "" : '<button type="button">' + esc(a.entrar || "Começar") + "</button>" + (a.inicio ? "" : '<a class="vi" href="/inicio/">← Voltar ao início</a>')) + '<div class="ft">HS Gestão</div></div>';
  if (id === "hub") {
    d.className = "hs-ab hs-hub";
    d.innerHTML = '<div class="in"><img class="logo" src="/autorizacao/logo-hs.png" alt="HS Eletricidade"><div class="tri"></div>' +
      '<div class="nm">HS GESTÃO</div><p class="tg">Campo e escritório em um só lugar</p><button type="button">Entrar</button></div>' +
      '<svg class="fios" viewBox="0 0 400 130" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M-10 92 H232 Q252 92 252 72 V40 Q252 22 270 22 H410" fill="none" stroke="#00A0E7" stroke-width="5"/>' +
      '<path d="M-10 106 H262 Q282 106 282 86 V54 Q282 36 300 36 H410" fill="none" stroke="#FE0000" stroke-width="5"/>' +
      '<circle cx="18" cy="92" r="6" fill="#00A0E7"/><circle cx="40" cy="106" r="6" fill="#FE0000"/></svg>' +
      '<div class="rod">HS ELETRICIDADE · MC MANUTENÇÕES</div>';
  }
  var raiz = document.documentElement, ov = raiz.style.overflow;
  raiz.style.overflow = "hidden";
  document.body.appendChild(d);
  function fechar() {
    try { sessionStorage.setItem(K, "1"); } catch (e) {}
    d.style.opacity = "0"; raiz.style.overflow = ov;
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 260);
  }
  var b = d.querySelector("button");
  if (b) { b.addEventListener("click", fechar); b.focus(); }
  else { d.addEventListener("click", fechar); setTimeout(fechar, 900); }
})();
