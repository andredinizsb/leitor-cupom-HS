// GET /api/gestao/exportar — CSV (separador ;) de autorizações + atendimentos, para a planilha / Power BI
import { semBanco, ERRO_BANCO, resp, statusVisivel } from "../../../lib/aut.js";

function c(v) {
  if (v == null) return "";
  let s = String(v);
  if (typeof v === "number") s = s.replace(".", ",");
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function onRequestGet({ env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const rs = await env.DB.prepare(
    "SELECT a.*, t.data_cupom, t.cnpj AS at_cnpj, t.estabelecimento AS at_estab, t.chave_nfce, t.numero_nf, t.valor_total, t.parcial, t.registrado_em AS at_registrado_em " +
    "FROM autorizacoes a LEFT JOIN atendimentos t ON t.numero = a.numero ORDER BY a.solicitado_em, t.id").all();
  const cab = ["Numero", "Tipo", "Status", "Colaborador", "Empresa", "Obra", "Estabelecimento indicado", "Veiculo", "Marca/Modelo", "Km", "Combustivel", "Litros max",
    "Solicitado em", "Validade", "Decidido por", "Assinado por", "Decidido em", "Motivo", "Cupom data", "Cupom CNPJ", "Cupom estabelecimento", "Chave NFC-e", "NF", "Valor cupom", "Parcial", "Cupom registrado em"];
  const linhas = [cab.join(";")];
  (rs.results || []).forEach(function (a) {
    linhas.push([a.numero, a.tipo, statusVisivel(a), a.colaborador, a.empresa, a.obra, a.estabelecimento, a.veiculo, a.marca_modelo, a.km, a.combustivel, a.litros_max,
      a.solicitado_em, a.validade, a.decidido_por, a.assinado_por_nome, a.decidido_em, a.motivo, a.data_cupom, a.at_cnpj, a.at_estab, a.chave_nfce, a.numero_nf, a.valor_total,
      a.parcial == null ? "" : (a.parcial ? "Sim" : "Não"), a.at_registrado_em].map(c).join(";"));
  });
  return new Response("﻿" + linhas.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="autorizacoes.csv"', "Cache-Control": "no-store" }
  });
}
