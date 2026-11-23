// GET /api/gestao/relatorio?tipo=rdo|checklist|frota&numero=... — relatório final para imprimir / salvar em PDF (login do Access).
import { resp, semBanco, ERRO_BANCO, txt } from "../../../lib/aut.js";
import { relatorioHtml, dadosRelatorio } from "../../../lib/relatorio.js";
import { ITENS } from "../../../lib/checklist.js";

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const q = new URL(request.url).searchParams, tipo = q.get("tipo"), numero = txt(q.get("numero"), 30);
  if (!["rdo", "checklist", "frota"].includes(tipo) || !numero) return resp({ ok: false, erro: "parametros" }, 400);
  const d = await dadosRelatorio(env, tipo, numero);
  if (!d) return resp({ ok: false, erro: "nao_encontrado" }, 404);
  const fotos = d.fotos.map(function (f) {
    const url = "/api/gestao/" + f.rota + "?id=" + f.id;
    return { titulo: f.titulo, tipo: f.tipo, arquivo: f.arquivo, src: f.tem ? url : null, link: f.tem ? url : null };
  });
  return new Response(relatorioHtml(tipo, d.reg, { fotos: fotos, barra: true, itens: ITENS }),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
