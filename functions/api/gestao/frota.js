// /api/gestao/frota — manutenções da frota lançadas pelo escritório (login do Access, ver _middleware)
// GET ?de=AAAA-MM-DD&ate=AAAA-MM-DD&q=texto[&formato=csv]   POST { data, veiculo, km, tipo, item, ..., arquivo: { nome, dados } } | { acao: "excluir", numero }
import { resp, origemOk, semBanco, ERRO_BANCO, agora } from "../../../lib/aut.js";
import { dia, lerManut, linhaManut, conferirArquivo, gravarArquivo, arquivosPorRef, proximoNumeroMan, ITENS_PLANO, TIPOS_MANUT } from "../../../lib/frota.js";

function c(v) { if (v == null) return ""; const s = String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

export async function onRequestGet({ request, env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const u = new URL(request.url);
  const de = dia(u.searchParams.get("de")) || "2000-01-01", ate = dia(u.searchParams.get("ate")) || "2999-12-31";
  const q = (u.searchParams.get("q") || "").trim().toLowerCase();
  const rs = await env.DB.prepare("SELECT * FROM frota_manut WHERE excluido = 0 AND data >= ?1 AND data <= ?2 ORDER BY data DESC, numero DESC LIMIT 2000").bind(de, ate).all();
  let L = rs.results || [];
  if (q) L = L.filter(function (x) { return [x.numero, x.veiculo, x.item, x.tipo, x.servico, x.oficina, x.nf, x.obs].join(" ").toLowerCase().indexOf(q) >= 0; });
  const arqs = await arquivosPorRef(env.DB, "MAN:");
  if (u.searchParams.get("formato") === "csv") {
    const P = L.map(function (x) { return linhaManut(x, arqs["MAN:" + x.numero]); }), cab = Object.keys(linhaManut({}));
    const out = [cab.join(";")].concat(P.map(function (x) { return cab.map(function (k) { return c(x[k]); }).join(";"); }));
    return new Response("﻿" + out.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="manutencoes.csv"', "Cache-Control": "no-store" } });
  }
  return resp({ ok: true, quem: data && data.quem, itens: ITENS_PLANO, tipos: TIPOS_MANUT,
    manutencoes: L.map(function (x) { const a = arqs["MAN:" + x.numero]; return Object.assign({}, x, { arquivo: a || null }); }) });
}

export async function onRequestPost({ request, env, data }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido", msg: "Não foi possível ler o lançamento." }, 400); }
  const quem = (data && data.quem) || "", db = env.DB;
  if (d.acao === "excluir") {
    const r = await db.prepare("UPDATE frota_manut SET excluido = 1, excluido_por = ?2, excluido_em = ?3 WHERE numero = ?1 AND excluido = 0").bind(String(d.numero || ""), quem, agora()).run();
    return r.meta && r.meta.changes ? resp({ ok: true }) : resp({ ok: false, erro: "nao_encontrada", msg: "Lançamento não encontrado." }, 404);
  }
  const l = lerManut(d);
  if (l.erro) return resp({ ok: false, erro: "dados", msg: l.erro }, 400);
  const a = conferirArquivo(env, d.arquivo);
  if (!a.ok) return resp({ ok: false, erro: "arquivo", msg: a.msg }, 400);
  const m = l.m, ano = Number(m.data.slice(0, 4)), quando = agora();
  let numero = null;
  for (let t = 0; t < 3 && !numero; t++) {
    const n = await proximoNumeroMan(db, ano);
    try {
      await db.prepare("INSERT INTO frota_manut (numero, criado_em, criado_por, data, veiculo, frota, placa, km, tipo, item, servico, oficina, nf, valor_pecas, valor_servico, valor_total, obs) " +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)")
        .bind(n, quando, quem, m.data, m.veiculo, m.frota, m.placa, m.km, m.tipo, m.item, m.servico, m.oficina, m.nf, m.valor_pecas, m.valor_servico, m.valor_total, m.obs).run();
      numero = n;
    } catch (e) { if (!/UNIQUE|constraint/i.test(String(e && e.message))) throw e; }
  }
  if (!numero) return resp({ ok: false, erro: "numero_ocupado", msg: "Tente salvar de novo." }, 503);
  if (a.arq) await gravarArquivo(env, "MAN:" + numero, a.arq);
  return resp({ ok: true, numero: numero, arquivo: !!a.arq });
}
