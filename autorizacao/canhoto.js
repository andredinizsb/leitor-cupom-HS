// HS Gestão · canhoto digital (mesmo modelo do bloco de papel: Compra de Materiais e Abastecimento)
// Usado pela tela do colaborador (/autorizacao/) e pela gestão (/gestao/). Gera PDF e compartilha.
(function () {
  "use strict";
  var EMPRESA = {
    razao: "HERCILIO BOATTO JUNIOR - ME",
    cnpj: "09.647.420/0001-39",
    ie: "710.068.884.115",
    crea: "1921026",
    fone: "(18) 3401-7542",
    claro: "(18) 99143-1314",
    vivo: "(18) 99782-8061",
    emails: "hseletricidade@yahoo.com.br / financeiro@hseletricidade.com.br",
    endereco: "Rua José Dias Nunes, 11 - Pq Industrial - Valparaíso - SP",
    cidade: "Valparaíso"
  };
  var LOGO = "/autorizacao/logo-hs.jpg";
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var CARIMBO = { "Cancelada": "CANCELADA", "Expirada": "VENCIDA", "Atendida": "UTILIZADA", "Recusada": "RECUSADA" };

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function nbr(v) { return v == null || v === "" ? "" : String(v).replace(".", ","); }
  function partes(iso) {
    var d = iso ? new Date(iso) : new Date();
    try {
      var f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
      var o = {}; f.forEach(function (p) { o[p.type] = p.value; });
      return { dia: o.day, mes: o.month, ano: o.year, hora: o.hour + ":" + o.minute };
    } catch (e) { return { dia: String(d.getDate()).padStart(2, "0"), mes: String(d.getMonth() + 1).padStart(2, "0"), ano: String(d.getFullYear()), hora: "" }; }
  }
  function placaDe(v) { var m = /\b([A-Z]{3}\d[A-Z0-9]\d{2})\b/i.exec(v || ""); return m ? m[1].toUpperCase() : (v || ""); }

  var CSS = '' +
    '.cnh{position:relative;box-sizing:border-box;width:100%;max-width:760px;margin:0 auto;background:#FBF8DA;color:#1d1d1d;border:2px solid #3b3b3b;border-radius:16px;padding:14px 16px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.35;overflow:hidden}' +
    '.cnh *{box-sizing:border-box}.cnh-top{display:flex;gap:12px;align-items:center}.cnh-logo{width:38%;max-width:250px;height:auto;flex:none}' +
    '.cnh-emp{flex:1;text-align:right;font-size:11px;line-height:1.35}.cnh-emp b{display:block;font-size:13px}' +
    '.cnh-tit{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#C9C9C9;border:1px solid #9a9a9a;margin:12px -16px 10px;padding:7px 16px}' +
    '.cnh-tit span{font-weight:800;font-size:16px;letter-spacing:.3px}.cnh-num{color:#D3191C;font-weight:800;font-size:18px;white-space:nowrap;font-family:"Courier New",monospace}' +
    '.cnh-obra{display:inline-flex;border:1.5px solid #3b3b3b;border-radius:4px;overflow:hidden;margin-top:10px;font-size:12px}' +
    '.cnh-obra span{background:#e9e6c4;padding:3px 8px;font-weight:700;border-right:1.5px solid #3b3b3b}.cnh-obra b{padding:3px 10px}' +
    '.cnh p{margin:6px 0 10px}.cnh-campo{display:flex;align-items:flex-end;gap:6px;margin:8px 0}.cnh-campo>span{white-space:nowrap}' +
    '.cnh-campo>b{flex:1;border-bottom:1px solid #555;padding:0 4px 1px;min-height:19px;font-family:"Segoe Print","Bradley Hand","Comic Sans MS",cursive;font-weight:400;color:#1a3fa0;font-size:15px}' +
    '.cnh-row{display:flex;gap:14px}.cnh-row>.cnh-campo{flex:1}' +
    '.cnh-itens{list-style:none;margin:0 0 8px;padding:0}.cnh-itens li{border-bottom:1px solid #777;min-height:24px;padding:4px 4px 1px;font-family:"Segoe Print","Bradley Hand","Comic Sans MS",cursive;color:#1a3fa0;font-size:14px}' +
    '.cnh-rod{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-top:14px;flex-wrap:wrap}' +
    '.cnh-data u{font-family:"Segoe Print","Bradley Hand","Comic Sans MS",cursive;color:#1a3fa0;text-decoration:none;border-bottom:1px solid #555;padding:0 6px}' +
    '.cnh-ass{text-align:center;min-width:230px;flex:1;max-width:320px;margin-left:auto}.cnh-ass img{display:block;max-width:100%;height:62px;object-fit:contain;margin:0 auto -6px}' +
    '.cnh-ass .vazio{height:56px}.cnh-ass .ln{border-top:1px solid #333;padding-top:2px;font-size:12px}.cnh-ass small{display:block;font-size:10.5px;color:#444}' +
    '.cnh-val{margin-top:10px;font-size:10.5px;color:#555;text-align:center;border-top:1px dashed #b9b48c;padding-top:6px}' +
    '.cnh-carimbo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-18deg);border:5px solid rgba(211,25,28,.75);color:rgba(211,25,28,.75);font:800 46px Arial,sans-serif;padding:4px 18px;border-radius:10px;letter-spacing:3px;pointer-events:none}' +
    '@media (max-width:520px){.cnh{font-size:12px;padding:10px 10px 12px}.cnh-top{flex-direction:column;gap:6px}.cnh-logo{width:72%;max-width:240px}.cnh-emp{text-align:center;font-size:9.5px}.cnh-emp b{font-size:11.5px}' +
    '.cnh-tit{margin:10px -10px 8px;padding:6px 10px;flex-wrap:wrap;gap:2px 8px}.cnh-tit span{font-size:12.5px}.cnh-num{font-size:14px}.cnh-row{flex-direction:column;gap:0}.cnh-rod{flex-direction:column;align-items:stretch;gap:10px}.cnh-ass{flex:none;min-width:0;max-width:none;width:100%;margin:0}.cnh-carimbo{font-size:30px}}';
  if (!document.getElementById("cnh-css")) { var st = document.createElement("style"); st.id = "cnh-css"; st.textContent = CSS; document.head.appendChild(st); }

  function cabecalho() {
    return '<div class="cnh-top"><img class="cnh-logo" src="' + LOGO + '" alt="HS Eletricidade" crossorigin="anonymous">' +
      '<div class="cnh-emp"><b>' + esc(EMPRESA.razao) + '</b>CNPJ: ' + esc(EMPRESA.cnpj) + ' / Inscrição Estadual ' + esc(EMPRESA.ie) + '<br>' +
      'Inscrição CREA: ' + esc(EMPRESA.crea) + '<br>Fone: ' + esc(EMPRESA.fone) + '<br>Claro: ' + esc(EMPRESA.claro) + ' / Vivo: ' + esc(EMPRESA.vivo) + '<br>' +
      'Email: ' + esc(EMPRESA.emails) + '<br>' + esc(EMPRESA.endereco) + '</div></div>';
  }
  function campo(rot, val) { return '<div class="cnh-campo"><span>' + esc(rot) + '</span><b>' + esc(val) + '</b></div>'; }
  function assinatura(a, rotulo) {
    var img = a.assinatura ? '<img src="' + a.assinatura + '" alt="assinatura">' : '<div class="vazio"></div>';
    return '<div class="cnh-ass">' + img + '<div class="ln">' + esc(rotulo) + '</div>' + (a.assinado_por_nome ? '<small>' + esc(a.assinado_por_nome) + '</small>' : '') + '</div>';
  }
  function obraTxt(a) { return (a.empresa ? a.empresa + " · " : "") + (a.obra || ""); }

  // HTML do canhoto. a = autorização (campos do /api/aut/ver ou /api/gestao/canhoto)
  function render(a) {
    var p = partes(a.decidido_em), abast = a.tipo === "Abastecimento", h = '<div class="cnh">';
    h += cabecalho();
    h += '<div class="cnh-obra"><span>Obra</span><b>' + esc(obraTxt(a)) + '</b></div>';
    if (abast) {
      h += '<div class="cnh-tit"><span>AUTORIZAÇÃO DE ABASTECIMENTO</span><span class="cnh-num">' + esc(a.numero) + '</span></div>';
      h += campo("Nome:", a.colaborador);
      h += campo("Marca/Modelo:", a.marca_modelo || "");
      h += '<div class="cnh-row">' + campo("Placa:", placaDe(a.veiculo)) + campo("KM:", a.km != null ? Number(a.km).toLocaleString("pt-BR") : "") + '</div>';
      h += campo("Combustível:", (a.combustivel || "") + (a.litros_max ? " — até " + nbr(a.litros_max) + " litros" : ""));
      if (a.estabelecimento) h += campo("Posto:", a.estabelecimento);
      h += '<div class="cnh-row">' + campo(EMPRESA.cidade, p.dia + "/" + p.mes + "/" + p.ano) + campo("Destino Viagem:", a.justificativa || "") + '</div>';
      h += '<div class="cnh-rod"><div></div>' + assinatura(a, "Assinatura do Responsável") + '</div>';
    } else {
      h += '<div class="cnh-tit"><span>AUTORIZAÇÃO DE COMPRA DE MATERIAIS</span><span class="cnh-num">' + esc(a.numero) + '</span></div>';
      h += '<p>A empresa <b>HS ELETRICIDADE</b>, autoriza por meio deste a realização de compras de materiais:</p>';
      h += campo("Funcionário:", a.colaborador);
      var itens = (a.itens || []).map(function (x) {
        return (x.qtd != null ? nbr(x.qtd) + (x.unidade ? " " + x.unidade : "") + " — " : "") + x.descricao;
      });
      if (a.estabelecimento) itens.push("Estabelecimento: " + a.estabelecimento);
      while (itens.length < 3) itens.push("");
      h += '<ul class="cnh-itens">' + itens.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ul>';
      var mes = MESES[parseInt(p.mes, 10) - 1] || p.mes;
      h += '<div class="cnh-rod"><div class="cnh-data">' + esc(EMPRESA.cidade) + ' <u>' + esc(p.dia) + '</u> de <u>' + esc(mes) + '</u> de <u>' + esc(p.ano) + '</u></div>' +
        assinatura(a, "Responsável") + '</div>';
    }
    if (a.validade) { var v = partes(a.validade); h += '<div class="cnh-val">Válida até ' + v.dia + '/' + v.mes + '/' + v.ano + ' às ' + v.hora + ' · Uso único · ' + esc(a.tipo) + '</div>'; }
    var st = a.status_visivel || a.status;
    if (CARIMBO[st]) h += '<div class="cnh-carimbo">' + CARIMBO[st] + '</div>';
    return h + '</div>';
  }

  var libs = null;
  function carregar(src) { return new Promise(function (ok, erro) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { erro(new Error("falha ao carregar " + src)); }; document.head.appendChild(s); }); }
  function bibliotecas() {
    if (!libs) libs = Promise.all([
      window.html2canvas ? 1 : carregar("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
      (window.jspdf && window.jspdf.jsPDF) ? 1 : carregar("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
    ]);
    return libs;
  }

  // PDF do canhoto (A4 em pé, canhoto no topo, largura 190 mm). Devolve um File.
  function pdf(a) {
    return bibliotecas().then(function () {
      var box = document.createElement("div");
      box.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;background:#fff;padding:0";
      box.innerHTML = render(a);
      document.body.appendChild(box);
      var imgs = Array.prototype.slice.call(box.querySelectorAll("img"));
      return Promise.all(imgs.map(function (im) { return im.complete ? 1 : new Promise(function (ok) { im.onload = im.onerror = ok; }); }))
        .then(function () { return window.html2canvas(box.firstChild, { scale: 2, backgroundColor: "#ffffff", useCORS: true }); })
        .then(function (cv) {
          document.body.removeChild(box);
          var doc = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
          var w = 190, h = cv.height * w / cv.width;
          doc.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10, w, h);
          doc.setProperties({ title: "Autorização " + a.numero + " - HS Eletricidade" });
          return new File([doc.output("blob")], "Autorizacao " + a.numero + ".pdf", { type: "application/pdf" });
        }, function (e) { if (box.parentNode) document.body.removeChild(box); throw e; });
    });
  }
  function baixar(arq) {
    var url = URL.createObjectURL(arq), l = document.createElement("a");
    l.href = url; l.download = arq.name; document.body.appendChild(l); l.click(); l.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  // Envia o PDF pelo compartilhamento do celular (WhatsApp, e-mail...). Sem suporte: baixa o PDF.
  function enviar(a) {
    return pdf(a).then(function (arq) {
      var dados = { files: [arq], title: "Autorização " + a.numero, text: "Autorização " + a.numero + " — HS Eletricidade" };
      if (navigator.canShare && navigator.canShare(dados)) return navigator.share(dados).catch(function (e) { if (!e || e.name !== "AbortError") baixar(arq); });
      baixar(arq);
      return "baixado";
    });
  }

  window.HSCanhoto = { render: render, pdf: function (a) { return pdf(a).then(baixar); }, enviar: enviar, EMPRESA: EMPRESA };
})();
