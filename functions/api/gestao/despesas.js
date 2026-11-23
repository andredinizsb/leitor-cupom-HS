// /api/gestao/despesas — despesas lançadas no formulário do Jotform (app Despesas e o próprio formulário). Só a gestão (Access, ver _middleware).
// GET  ?de=AAAA-MM-DD&ate=AAAA-MM-DD&obra=&cat=&colab=&q=[&formato=csv|relatorio][&opcoes=1]  -> lista + totais do período
// POST {id, campos:{data, obra, obra_desc, tipo, valor, qtd, fornecedor, cnpj, nf, descricao, frota, litros, obs, colaboradores[]}}
//      -> grava no Jotform (a planilha relê o Jotform no "Atualizar tudo") e registra quem editou (D1: despesas_edicoes).
// Chave: variável secreta JOTFORM_API_KEY do projeto Pages. Para EDITAR, a chave do Jotform precisa ser de "Acesso total".
import { resp, origemOk } from "../../../lib/aut.js";
import { FORM_ID, lerFormulario, lerOpcoes } from "../../../lib/jotform.js";
import { relatorioHtml } from "../../../lib/relatorio.js";

const SEM_CHAVE = { ok: false, erro: "sem_chave", msg: "Falta a chave do Jotform (JOTFORM_API_KEY) no Cloudflare Pages." };
const SEM_PERMISSAO = "A chave do Jotform é só de leitura. Crie uma chave com “Acesso total” no Jotform e troque a JOTFORM_API_KEY no Cloudflare.";
const TABELA = "CREATE TABLE IF NOT EXISTS despesas_edicoes (id INTEGER PRIMARY KEY AUTOINCREMENT, sub_id TEXT NOT NULL, por TEXT, em TEXT, antes TEXT, depois TEXT)";

function base(env) { return String(env.JOTFORM_API || "https://api.jotform.com").replace(/\/$/, ""); }
async function jf(env, caminho, metodo, corpo) {
  const h = { APIKEY: env.JOTFORM_API_KEY };
  if (corpo) h["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
  const r = await fetch(base(env) + caminho, { method: metodo || "GET", headers: h, body: corpo });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok || !j || Number(j.responseCode) !== 200) {
    const e = new Error(r.status === 401 || (j && Number(j.responseCode) === 401) ? "sem_permissao" : "jotform_" + r.status);
    throw e;
  }
  return j.content;
}

// ---- leitura de uma resposta do formulário ----
function bruto(s, q) { const a = s.answers && s.answers[q]; return a ? a.answer : ""; }
function texto(x) { if (x == null) return ""; if (Array.isArray(x)) return x.map(texto).filter(Boolean).join(", "); if (typeof x === "object") return ""; return String(x).trim(); }
function numero(x) {
  let s = texto(x).replace(/\s|R\$/g, ""); if (!s) return 0;
  if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s); return isFinite(n) ? n : 0;
}
function lista(x) {
  if (Array.isArray(x)) return x.map(texto).filter(Boolean);
  const s = texto(x); return s ? s.split(/\r?\n|<br\s*\/?>/i).map(function (y) { return y.trim(); }).filter(Boolean) : [];
}
function dois(n) { return ("0" + n).slice(-2); }
function dataDe(s) {
  const d = bruto(s, "3");
  if (d && typeof d === "object" && !Array.isArray(d)) {
    if (d.year && d.month && d.day) return d.year + "-" + dois(d.month) + "-" + dois(d.day);
    if (d.datetime) return String(d.datetime).slice(0, 10);
  }
  const t = texto(d), a = /^(\d{4})-(\d{2})-(\d{2})/.exec(t), b = /^(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(t);
  if (a) return a[1] + "-" + a[2] + "-" + a[3];
  if (b) return b[3] + "-" + b[2] + "-" + b[1];
  return String(s.created_at || "").slice(0, 10);
}
function item(s, obras, eds) {
  const ob = texto(bruto(s, "8")), o = obras[ob] || {}, tipo = texto(bruto(s, "12")), e = eds[String(s.id)];
  const fotos = bruto(s, "18");
  return {
    id: String(s.id), data: dataDe(s), obra: ob, obra_desc: texto(bruto(s, "10")), empresa: o.e || "", cliente: o.c || "", obra_cad: o.d || "",
    tipo: tipo, categoria: tipo.split(" - ")[0].trim() || "Sem tipo", valor: numero(bruto(s, "16")), qtd: texto(bruto(s, "20")),
    fornecedor: texto(bruto(s, "21")), cnpj: texto(bruto(s, "24")), nf: texto(bruto(s, "26")), descricao: texto(bruto(s, "15")),
    frota: texto(bruto(s, "13")), litros: texto(bruto(s, "14")), colaboradores: lista(bruto(s, "11")), obs: texto(bruto(s, "19")),
    fotos: Array.isArray(fotos) ? fotos.filter(function (u) { return /^https:\/\//.test(u); }) : [],
    enviado: String(s.created_at || ""), editado_por: e ? e.por : "", editado_em: e ? e.em : ""
  };
}
async function todas(env) {
  const out = [];
  for (let o = 0; o < 20000; o += 1000) {
    const c = await jf(env, "/form/" + FORM_ID + "/submissions?limit=1000&offset=" + o + "&orderby=created_at");
    for (const s of c || []) if (s.status !== "DELETED") out.push(s);
    if (!c || c.length < 1000) break;
  }
  return out;
}
async function lerObras(env, request) {
  try {
    const u = new URL("/obras.json", request.url);
    const r = env.ASSETS ? await env.ASSETS.fetch(new Request(u)) : await fetch(u);
    const m = {}; (await r.json()).forEach(function (o) { m[String(o.n)] = o; }); return m;
  } catch (e) { return {}; }
}
async function edicoes(env) {
  const m = {};
  if (!env.DB) return m;
  try {
    await env.DB.prepare(TABELA).run();
    const rs = await env.DB.prepare("SELECT sub_id, por, em FROM despesas_edicoes ORDER BY id").all();
    (rs.results || []).forEach(function (x) { m[x.sub_id] = { por: x.por, em: x.em }; });
  } catch (e) {}
  return m;
}
function dia(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : ""; }
function csv(v) { if (v == null) return ""; const s = String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

export async function onRequestGet({ request, env, data }) {
  if (!env.JOTFORM_API_KEY) return resp(SEM_CHAVE, 503);
  const q = new URL(request.url).searchParams;
  let subs, obras, eds;
  try { [subs, obras, eds] = await Promise.all([todas(env), lerObras(env, request), edicoes(env)]); }
  catch (e) { return resp({ ok: false, erro: e.message, msg: e.message === "sem_permissao" ? "A chave do Jotform não tem acesso a este formulário." : "O Jotform não respondeu. Tente de novo." }, 502); }
  const de = dia(q.get("de")) || "2000-01-01", ate = dia(q.get("ate")) || "2999-12-31";
  const doPeriodo = subs.map(function (s) { return item(s, obras, eds); }).filter(function (x) { return x.data >= de && x.data <= ate; })
    .sort(function (a, b) { return a.data === b.data ? (a.enviado < b.enviado ? 1 : -1) : (a.data < b.data ? 1 : -1); });
  // opções dos filtros saem do período inteiro (antes de filtrar por obra/categoria/colaborador)
  const uniq = function (f) { const m = {}; doPeriodo.forEach(function (x) { [].concat(f(x)).forEach(function (v) { if (v) m[v] = 1; }); }); return Object.keys(m).sort(function (a, b) { return a.localeCompare(b, "pt-BR", { numeric: true }); }); };
  const facetas = { obras: uniq(function (x) { return x.obra; }), categorias: uniq(function (x) { return x.categoria; }), colaboradores: uniq(function (x) { return x.colaboradores; }) };
  const fObra = q.get("obra") || "", fCat = q.get("cat") || "", fCol = q.get("colab") || "", busca = (q.get("q") || "").trim().toLowerCase();
  const L = doPeriodo.filter(function (x) {
    if (fObra && x.obra !== fObra) return false;
    if (fCat && x.categoria !== fCat) return false;
    if (fCol && x.colaboradores.indexOf(fCol) < 0) return false;
    if (busca && [x.obra, x.obra_desc, x.cliente, x.tipo, x.fornecedor, x.cnpj, x.nf, x.descricao, x.frota, x.obs, x.colaboradores.join(" ")].join(" ").toLowerCase().indexOf(busca) < 0) return false;
    return true;
  });
  const formato = q.get("formato");
  if (formato === "csv") {
    const cab = ["Data", "Obra", "Empresa", "Cliente", "Descrição da obra", "Tipo", "Categoria", "Fornecedor", "CNPJ", "NF / recibo", "Descrição", "Qtd", "Valor", "Frota", "Litros", "Colaboradores", "Observação", "Enviado em", "Editado por", "Editado em", "ID Jotform"];
    const linhas = L.map(function (x) {
      return [x.data.split("-").reverse().join("/"), x.obra, x.empresa, x.cliente, x.obra_desc, x.tipo, x.categoria, x.fornecedor, x.cnpj, x.nf, x.descricao, x.qtd, String(x.valor.toFixed(2)).replace(".", ","),
        x.frota, x.litros, x.colaboradores.join(", "), x.obs, x.enviado, x.editado_por, x.editado_em, x.id].map(csv).join(";");
    });
    return new Response("﻿" + [cab.join(";")].concat(linhas).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="despesas.csv"', "Cache-Control": "no-store" } });
  }
  if (formato === "relatorio") {
    const mapa = {}; L.forEach(function (x) { if (x.obra) mapa[x.obra] = { cliente: x.cliente, descricao: x.obra_cad || x.obra_desc }; });
    const itens = L.map(function (x) { return { data: x.data, obra: x.obra, fornecedor: x.fornecedor, categoria: x.categoria, descricao: x.descricao || x.tipo, qtd: x.qtd, valor: x.valor, nf: x.nf, frota: x.frota }; });
    return new Response(relatorioHtml("despesas-geral", { empresa: "HS", numero: "despesas-geral", itens: itens, obras: mapa }, { barra: true }),
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const r = { ok: true, quem: data && data.quem, despesas: L, facetas: facetas, total_periodo: doPeriodo.length };
  if (q.get("opcoes") === "1") { try { r.opcoes = lerOpcoes(await lerFormulario()); } catch (e) { r.opcoes = { tipo: [], placa: [], colaboradores: [] }; } }
  return resp(r);
}

// ---- edição ----
const CAMPOS = { obra: "8", obra_desc: "10", tipo: "12", frota: "13", litros: "14", descricao: "15", valor: "16", obs: "19", qtd: "20", fornecedor: "21", cnpj: "24", nf: "26" };
function limpa(v, n) { return String(v == null ? "" : v).replace(/[\x00-\x09\x0b-\x1f]/g, "").trim().slice(0, n || 300); }
function corpo(pares) { return pares.map(function (p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]); }).join("&"); }

export async function onRequestPost({ request, env, data }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem" }, 403);
  if (!env.JOTFORM_API_KEY) return resp(SEM_CHAVE, 503);
  let d; try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json" }, 400); }
  const id = String((d && d.id) || "").replace(/\D/g, ""), c = (d && d.campos) || {};
  if (!id) return resp({ ok: false, erro: "id" }, 400);
  const obras = await lerObras(env, request), sem = {};
  let s;
  try { s = await jf(env, "/submission/" + id); } catch (e) { return resp({ ok: false, erro: "nao_encontrada", msg: "Despesa não encontrada no Jotform." }, 404); }
  if (String(s.form_id) !== FORM_ID) return resp({ ok: false, erro: "nao_encontrada" }, 404);
  const antes = item(s, obras, sem), novo = {}, pares = [];
  // validação
  if (c.obra != null && !/^\d{1,6}$/.test(String(c.obra).trim())) return resp({ ok: false, erro: "obra", msg: "Nº da obra: só números." }, 400);
  if (c.valor != null) { const v = numero(c.valor); if (!(v > 0) || v > 1e7) return resp({ ok: false, erro: "valor", msg: "Valor inválido." }, 400); c.valor = String(Math.round(v * 100) / 100); }
  if (c.data != null && !dia(c.data)) return resp({ ok: false, erro: "data", msg: "Data inválida." }, 400);
  for (const k of Object.keys(CAMPOS)) {
    if (c[k] == null) continue;
    const v = limpa(c[k], k === "obs" ? 1000 : 300), a = k === "valor" ? String(antes.valor) : String(antes[k] || "");
    if (k === "valor" ? numero(v) !== antes.valor : v !== a) { novo[k] = v; pares.push(["submission[" + CAMPOS[k] + "]", v]); }
  }
  if (c.data != null && c.data !== antes.data) { const p = c.data.split("-"); novo.data = c.data; pares.push(["submission[3_year]", p[0]], ["submission[3_month]", p[1]], ["submission[3_day]", p[2]]); }
  let colab = null;
  if (Array.isArray(c.colaboradores)) {
    colab = c.colaboradores.map(function (x) { return limpa(x, 120); }).filter(Boolean);
    if (colab.join("\n") !== antes.colaboradores.join("\n")) { novo.colaboradores = colab; colab.forEach(function (x, i) { pares.push(["submission[11][" + i + "]", x]); }); if (!colab.length) pares.push(["submission[11]", ""]); }
    else colab = null;
  }
  if (!pares.length) return resp({ ok: true, sem_mudanca: true, despesa: antes });
  if (novo.tipo) {
    try { const op = lerOpcoes(await lerFormulario()); if (op.tipo.length && op.tipo.indexOf(novo.tipo) < 0) return resp({ ok: false, erro: "tipo", msg: "Tipo de despesa não existe no formulário." }, 400); } catch (e) {}
  }
  try { await jf(env, "/submission/" + id, "POST", corpo(pares)); }
  catch (e) { return resp({ ok: false, erro: e.message, msg: e.message === "sem_permissao" ? SEM_PERMISSAO : "O Jotform não aceitou a alteração. Tente de novo." }, e.message === "sem_permissao" ? 403 : 502); }
  // confere o que ficou gravado; colaboradores em outro formato se o Jotform não entendeu o primeiro
  let depois = item(await jf(env, "/submission/" + id), obras, sem);
  if (colab && depois.colaboradores.join("\n") !== colab.join("\n")) {
    try { await jf(env, "/submission/" + id, "POST", corpo([["submission[11]", colab.join("\n")]])); depois = item(await jf(env, "/submission/" + id), obras, sem); } catch (e) {}
  }
  const falhou = Object.keys(novo).filter(function (k) {
    if (k === "colaboradores") return depois.colaboradores.join("\n") !== novo.colaboradores.join("\n");
    if (k === "valor") return depois.valor !== numero(novo.valor);
    return String(depois[k] || "") !== String(novo[k]);
  });
  const quem = (data && data.quem) || "gestao", em = new Date().toISOString();
  if (env.DB) {
    try {
      await env.DB.prepare(TABELA).run();
      const ant = {}; Object.keys(novo).forEach(function (k) { ant[k] = antes[k]; });
      await env.DB.prepare("INSERT INTO despesas_edicoes (sub_id, por, em, antes, depois) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, quem, em, JSON.stringify(ant), JSON.stringify(novo)).run();
    } catch (e) {}
  }
  depois.editado_por = quem; depois.editado_em = em;
  return resp({ ok: !falhou.length, despesa: depois, alterados: Object.keys(novo), nao_gravou: falhou,
    msg: falhou.length ? "O Jotform não gravou: " + falhou.join(", ") + "." : "Despesa atualizada. A planilha pega a mudança no próximo “Atualizar tudo”." });
}
