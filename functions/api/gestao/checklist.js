// GET /api/gestao/checklist?de=AAAA-MM-DD&ate=AAAA-MM-DD&q=texto[&formato=csv] — checklists para o escritório (login do Access, ver _middleware)
import { resp, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { lista } from "../../../lib/rdo.js";
import { linhaPlanilha } from "../../../lib/checklist.js";

function c(v) { if (v == null) return ""; const s = String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function dia(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null; }

export async function onRequestGet({ request, env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const u = new URL(request.url);
  const de = dia(u.searchParams.get("de")) || "2000-01-01", ate = (dia(u.searchParams.get("ate")) || "2999-12-31") + "T99";
  const q = (u.searchParams.get("q") || "").trim().toLowerCase();
  const rs = await env.DB.prepare("SELECT * FROM checklist WHERE data_check >= ?1 AND data_check < ?2 ORDER BY data_check DESC LIMIT 1000").bind(de, ate).all();
  let L = rs.results || [];
  if (q) L = L.filter(function (x) { return [x.numero, x.frota, x.condutor, x.obs, x.itens_problema, x.avaria_frente, x.avaria_lat_esq, x.avaria_traseira, x.avaria_lat_dir].join(" ").toLowerCase().indexOf(q) >= 0; });
  if (u.searchParams.get("formato") === "csv") {
    const P = L.map(linhaPlanilha), cab = Object.keys(P[0] || linhaPlanilha({}));
    const out = [cab.join(";")].concat(P.map(function (x) { return cab.map(function (k) { return c(x[k]); }).join(";"); }));
    return new Response("﻿" + out.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="checklist.csv"', "Cache-Control": "no-store" } });
  }
  const fotos = {};
  if (L.length) {
    const f = await env.DB.prepare("SELECT id, numero, secao, legenda, arquivo FROM checklist_fotos WHERE numero IN (SELECT numero FROM checklist WHERE data_check >= ?1 AND data_check < ?2) ORDER BY numero, ordem").bind(de, ate).all();
    (f.results || []).forEach(function (x) { (fotos[x.numero] = fotos[x.numero] || []).push({ id: x.id, secao: x.secao, legenda: x.legenda, arquivo: x.arquivo || null }); });
  }
  return resp({ ok: true, quem: data && data.quem, checklists: L.map(function (x) {
    return Object.assign({}, x, { avaria_frente: lista(x.avaria_frente), avaria_lat_esq: lista(x.avaria_lat_esq), avaria_traseira: lista(x.avaria_traseira), avaria_lat_dir: lista(x.avaria_lat_dir),
      itens_ok: lista(x.itens_ok), itens_problema: lista(x.itens_problema), fotos: fotos[x.numero] || [] });
  }) });
}
