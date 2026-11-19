// GET /api/gestao/rdo?de=AAAA-MM-DD&ate=AAAA-MM-DD&q=texto[&formato=csv] — RDOs para o escritório (exige login do Access, ver _middleware)
import { resp, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { lista, objeto, linhaPlanilha } from "../../../lib/rdo.js";

function c(v) { if (v == null) return ""; const s = String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function dia(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null; }

export async function onRequestGet({ request, env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const u = new URL(request.url);
  const de = dia(u.searchParams.get("de")) || "2000-01-01", ate = dia(u.searchParams.get("ate")) || "2999-12-31";
  const q = (u.searchParams.get("q") || "").trim().toLowerCase();
  const rs = await env.DB.prepare("SELECT * FROM rdo WHERE data_inicio >= ?1 AND data_inicio < ?2 ORDER BY data_inicio DESC LIMIT 1000").bind(de, ate + "T99").all();
  let rdos = rs.results || [];
  if (q) rdos = rdos.filter(function (r) { return [r.numero, r.obra, r.obra_desc, r.cliente, r.frota, r.frota_exec, r.responsavel, r.colaboradores, r.descricao].join(" ").toLowerCase().indexOf(q) >= 0; });
  if (u.searchParams.get("formato") === "csv") {
    const L = rdos.map(linhaPlanilha), cab = Object.keys(L[0] || linhaPlanilha({}));
    const out = [cab.join(";")].concat(L.map(function (x) { return cab.map(function (k) { return c(x[k]); }).join(";"); }));
    return new Response("﻿" + out.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="rdo.csv"', "Cache-Control": "no-store" } });
  }
  const fotos = {};
  if (rdos.length) {
    const f = await env.DB.prepare("SELECT id, numero, ordem, etapa, legenda FROM rdo_fotos WHERE numero IN (SELECT numero FROM rdo WHERE data_inicio >= ?1 AND data_inicio < ?2) ORDER BY numero, ordem").bind(de, ate + "T99").all();
    (f.results || []).forEach(function (x) { (fotos[x.numero] = fotos[x.numero] || []).push({ id: x.id, etapa: x.etapa, legenda: x.legenda }); });
  }
  return resp({ ok: true, quem: data && data.quem, rdos: rdos.map(function (r) {
    return Object.assign({}, r, { chave: undefined, colaboradores: lista(r.colaboradores), materiais: lista(r.materiais), seguranca: objeto(r.seguranca), fotos: fotos[r.numero] || [] });
  }) });
}
