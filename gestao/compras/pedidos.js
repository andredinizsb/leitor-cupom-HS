// HS Compras · cartões de pedido de compra (usado na cotação e na fila de pedidos). Precisa de /icons/assinatura.js para aprovar.
// HSPedidos.render(elemento, pedidos, { config:{limite, aprovadores}, hoje, quem, depois: function () { recarregar } })
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function rs(v) { return v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function br(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }
  var CLS = { "Aguardando aprovação": "s-warn", "Aprovado": "s-info", "Enviado": "s-info", "Confirmado": "s-ok", "Recebido parcial": "s-warn", "Recebido": "s-ok", "Recusado": "s-danger", "Cancelado": "" };
  var RECEBE = ["Aprovado", "Enviado", "Confirmado", "Recebido parcial"];
  function cobranca(p, atras) { return "Olá" + (p.contato ? ", " + p.contato : "") + "! Sobre o pedido de compra nº " + p.numero + " da " + (p.empresa === "MC" ? "MC Manutenções" : "HS Eletricidade") + ": " +
    (atras ? "a entrega estava prevista para " + br(p.data_prometida) + " e ainda não recebemos. Qual a nova previsão?" : "poderia confirmar o recebimento do pedido e a data de entrega?") + " Obrigado!"; }
  function formReceb(p) {
    return '<div class="rcb" hidden><table class="tabela" style="margin:10px 0"><thead><tr><th>Item</th><th class="q">Pedido</th><th class="q">Já veio</th><th>Recebido agora</th><th>Conforme?</th></tr></thead><tbody>' +
      p.itens.map(function (x) { var falta = Math.max(0, Number(x.qtd) - Number(x.recebido || 0)); return "<tr><td>" + esc(x.descricao) + '</td><td class="q">' + esc(String(x.qtd).replace(".", ",")) + " " + esc(x.unidade || "") + '</td><td class="q">' + esc(String(x.recebido || 0).replace(".", ",")) +
        '</td><td><input data-rq="' + x.item + '" inputmode="decimal" value="' + (falta ? String(falta).replace(".", ",") : "") + '" style="width:90px;min-height:36px;padding:4px 8px"' + (falta ? "" : " disabled") + '></td><td><select data-rc="' + x.item + '" style="min-height:36px;padding:4px 8px"><option>Sim</option><option>Não</option></select> <input data-ro="' + x.item + '" placeholder="o que está errado" style="min-height:36px;padding:4px 8px;width:150px"></td></tr>'; }).join("") +
      '</tbody></table><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="rnf" placeholder="Nº da NF" style="min-height:36px;padding:4px 8px;width:140px"><button class="btn pq" type="button" data-a="receber">Salvar recebimento</button></div></div>';
  }
  var LS = "hsAprovador";
  function api(c) {
    return fetch("/api/gestao/compras-pedido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) })
      .then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.msg || j.erro || "erro"); return j; });
  }
  function msgForn(p) {
    return "Olá" + (p.contato ? ", " + p.contato : "") + "! Segue o pedido de compra nº " + p.numero + " da " + (p.empresa === "MC" ? "MC Manutenções" : "HS Eletricidade") +
      " (PDF em anexo), total " + rs(p.total) + ".\n" + p.itens.map(function (x) { return "• " + x.descricao + " — " + String(x.qtd).replace(".", ",") + " " + (x.unidade || ""); }).join("\n") +
      (p.local_entrega ? "\nEntrega: " + p.local_entrega + "." : "") + "\nPor favor, confirme o recebimento do pedido e a data de entrega. Obrigado!";
  }
  function zap(p) { var t = String(p.telefone || "").replace(/\D/g, ""); if (t.length >= 10 && t.length <= 11) t = "55" + t; return "https://wa.me/" + t + "?text=" + encodeURIComponent(msgForn(p)); }
  function cartao(p, o) {
    var pdf = "/api/gestao/compras-pedido?formato=pdf&numero=" + encodeURIComponent(p.numero), atras = p.status === "Confirmado" && p.data_prometida && p.data_prometida < (o.hoje || "");
    var h = '<div class="card ped" data-pc="' + esc(p.numero) + '"><div class="topo"><span class="num">PC ' + esc(p.numero) + '</span><span class="badge ' + (CLS[p.status] || "") + '">' + esc(p.status) + "</span>" +
      (atras ? '<span class="badge s-danger">Atrasado</span>' : "") + '<span style="flex:1"></span><b>' + rs(p.total) + "</b></div>";
    h += '<div class="meta" style="margin:4px 0 8px">' + esc(p.fornecedor) + " · " + esc(p.cond_pagto || "pagamento a combinar") + (p.frete_tipo ? " · frete " + esc(p.frete_tipo) : "") +
      ' · <a href="/gestao/compras/cotacao/?n=' + encodeURIComponent(p.req) + '">' + esc(p.req) + "</a></div>";
    h += '<ul style="margin:0 0 8px;padding-left:18px;font-size:14px">' + p.itens.map(function (x) { return "<li>" + esc(x.descricao) + " — " + esc(String(x.qtd).replace(".", ",")) + " " + esc(x.unidade || "") + " · " + rs(x.total) + "</li>"; }).join("") + "</ul>";
    var inf = [];
    if (p.aprovado_em) inf.push("Aprovado por " + esc(p.aprovador_nome || "") + " em " + esc(br(p.aprovado_em)));
    if (p.enviado_em) inf.push("Enviado ao fornecedor em " + esc(br(p.enviado_em)));
    if (p.data_prometida) inf.push("Entrega prometida: <b>" + esc(br(p.data_prometida)) + "</b>");
    if (p.motivo) inf.push("Motivo: " + esc(p.motivo));
    var tq = p.itens.reduce(function (s, x) { return s + Number(x.qtd || 0); }, 0), tr = p.itens.reduce(function (s, x) { return s + Number(x.recebido || 0); }, 0);
    if (tr) inf.push("Recebido " + String(tr).replace(".", ",") + " de " + String(tq).replace(".", ",") + ((p.recebimentos || []).some(function (r) { return r.conforme === "Não"; }) ? ' · <b style="color:var(--danger-text)">com não conformidade</b>' : ""));
    if (inf.length) h += '<div class="meta">' + inf.join(" · ") + "</div>";
    h += '<div class="acoes"><a class="btn ghost pq" target="_blank" rel="noopener" href="' + pdf + '">Abrir PDF</a>';
    if (p.status === "Aguardando aprovação") {
      var ap = (o.config && o.config.aprovadores) || [], salvo = ""; try { salvo = localStorage.getItem(LS) || ""; } catch (e) {}
      h += ap.length ? '<select class="apv" aria-label="Quem aprova" style="min-height:36px;padding:4px 8px;font-size:14px">' + '<option value="">Quem aprova…</option>' + ap.map(function (a) { return "<option" + (a === salvo ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("") + "</select>"
        : '<input class="apv" placeholder="Seu nome" value="' + esc(salvo) + '" style="min-height:36px;padding:4px 8px;font-size:14px;width:160px">';
      h += '<button class="btn pq" type="button" data-a="aprovar">Aprovar e assinar</button><button class="btn red pq" type="button" data-a="recusar">Recusar</button>';
    }
    if (p.status === "Aprovado" || p.status === "Enviado") {
      if (p.telefone) h += '<a class="btn ghost pq" target="_blank" rel="noopener" data-a="zap" href="' + zap(p) + '">WhatsApp</a>';
      if (p.email) h += '<a class="btn ghost pq" data-a="mail" href="mailto:' + esc(p.email) + "?subject=" + encodeURIComponent("Pedido de compra " + p.numero) + "&body=" + encodeURIComponent(msgForn(p)) + '">E-mail</a>';
      if (p.status === "Aprovado") h += '<button class="btn ghost pq" type="button" data-a="enviado">Marcar como enviado</button>';
    }
    if (["Aprovado", "Enviado", "Confirmado"].indexOf(p.status) >= 0) h += '<input type="date" class="dtp" value="' + esc(p.data_prometida || "") + '" aria-label="Data prometida" style="min-height:36px;padding:4px 8px;font-size:14px"><button class="btn pq" type="button" data-a="confirmar">' + (p.data_prometida ? "Mudar data" : "Confirmar entrega") + "</button>";
    if ((p.status === "Enviado" || atras) && p.telefone) h += '<a class="btn ghost pq" target="_blank" rel="noopener" href="https://wa.me/' + (function (t) { return t.length >= 10 && t.length <= 11 ? "55" + t : t; })(String(p.telefone).replace(/\D/g, "")) + "?text=" + encodeURIComponent(cobranca(p, atras)) + '">Cobrar fornecedor</a>';
    if (RECEBE.indexOf(p.status) >= 0) h += '<button class="btn ghost pq" type="button" data-a="abrirReceb">Registrar recebimento</button>';
    if (["Aguardando aprovação", "Aprovado", "Enviado", "Confirmado"].indexOf(p.status) >= 0) h += '<button class="btn ghost pq" type="button" data-a="cancelar">Cancelar</button>';
    return h + "</div>" + (RECEBE.indexOf(p.status) >= 0 ? formReceb(p) : "") + '<div class="msgp"></div></div>';
  }
  function render(el, L, o) {
    o = o || {};
    el.innerHTML = L.length ? L.map(function (p) { return cartao(p, o); }).join("") : '<div class="vazio">Nenhum pedido aqui.</div>';
    el.onclick = function (e) {
      var b = e.target.closest("[data-a]"); if (!b) return;
      var card = b.closest("[data-pc]"), n = card.getAttribute("data-pc"), p = L.filter(function (x) { return x.numero === n; })[0], a = b.getAttribute("data-a"), out = card.querySelector(".msgp");
      function fim(t) { return function () { out.innerHTML = t ? '<div class="msg ok">' + esc(t) + "</div>" : ""; if (o.depois) o.depois(); }; }
      function erro(x) { out.innerHTML = '<div class="msg">' + esc(x.message) + "</div>"; }
      if (a === "zap" || a === "mail") { if (p.status === "Aprovado") setTimeout(function () { api({ acao: "enviado", numero: n }).then(fim("Marcado como enviado. Anexe o PDF na conversa.")).catch(erro); }, 300); return; }
      if (a === "abrirReceb") { var f = card.querySelector(".rcb"); f.hidden = !f.hidden; return; }
      if (a === "receber") {
        var its = p.itens.map(function (x) { var q = card.querySelector('[data-rq="' + x.item + '"]'); return { item: x.item, qtd: q && !q.disabled ? q.value : "", conforme: card.querySelector('[data-rc="' + x.item + '"]').value, obs: card.querySelector('[data-ro="' + x.item + '"]').value }; });
        return api({ acao: "receber", numero: n, nf: card.querySelector(".rnf").value, itens: its }).then(fim("Recebimento registrado.")).catch(erro);
      }
      if (a === "enviado") return api({ acao: "enviado", numero: n }).then(fim("Marcado como enviado.")).catch(erro);
      if (a === "confirmar") { var d = card.querySelector(".dtp").value; if (!d) { out.innerHTML = '<div class="msg">Escolha a data que o fornecedor prometeu.</div>'; return; } return api({ acao: "confirmar", numero: n, data_prometida: d }).then(fim("Entrega confirmada: a data já aparece para o solicitante.")).catch(erro); }
      if (a === "recusar" || a === "cancelar") { var m = prompt(a === "recusar" ? "Motivo da recusa (volta para Suprimentos):" : "Motivo do cancelamento:"); if (!m) return; return api({ acao: a, numero: n, motivo: m }).then(fim()).catch(erro); }
      if (a === "aprovar") {
        var nome = (card.querySelector(".apv").value || "").trim(); if (!nome) { out.innerHTML = '<div class="msg">Escolha quem está aprovando.</div>'; return; }
        try { localStorage.setItem(LS, nome); } catch (x) {}
        if (!window.hsAssinar) { out.innerHTML = '<div class="msg">Recarregue a página para assinar.</div>'; return; }
        hsAssinar({ app: "gestao", titulo: "Aprovar o pedido " + n, sub: "Sua assinatura vai no PDF do pedido que segue para o fornecedor.", nome: nome,
          linhas: [["Fornecedor", p.fornecedor], ["Total", rs(p.total)], ["Itens", p.itens.length], ["Requisição", p.req]], confirmar: "Assinar e aprovar", voltar: "Cancelar",
          ok: function (png) { api({ acao: "aprovar", numero: n, nome: nome, assinatura: png }).then(fim("Pedido aprovado. Agora é só enviar ao fornecedor.")).catch(erro); } });
      }
    };
  }
  window.HSPedidos = { render: render };
})();
