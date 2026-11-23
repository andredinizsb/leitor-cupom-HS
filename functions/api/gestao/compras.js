// /api/gestao/compras — requisições de material para Suprimentos (login do Access, ver _middleware)
//   GET  ?situacao=abertas|todas|<status>&q=texto   -> lista com itens, anexos e histórico + contagem por situação
//   POST {numero, status?, previsao?, pedido?, obs_suprimentos?, motivo?, assumir?}  -> atualiza e registra no histórico
import { resp, origemOk, semBanco, ERRO_BANCO, txt, agora } from "../../../lib/aut.js";
import { garantir, evento, carregarReq, STATUS, ABERTOS, dia } from "../../../lib/compras.js";

export async function onRequestGet({ request, env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const db = env.DB;
  await garantir(db);
  const q = new URL(request.url).searchParams, sit = q.get("situacao") || "abertas", busca = (q.get("q") || "").trim().toLowerCase();
  const [rs, it, ev, an, ct] = await db.batch([
    db.prepare("SELECT * FROM compras_req ORDER BY criado_em DESC LIMIT 500"),
    db.prepare("SELECT numero, item, descricao, qtd, unidade, codigo_fx, obs FROM compras_req_itens WHERE numero IN (SELECT numero FROM compras_req ORDER BY criado_em DESC LIMIT 500) ORDER BY numero, item"),
    db.prepare("SELECT numero, em, por, de, para, obs FROM compras_eventos WHERE numero IN (SELECT numero FROM compras_req ORDER BY criado_em DESC LIMIT 500) ORDER BY id"),
    db.prepare("SELECT id, numero, nome, tipo, arquivo, (dados IS NOT NULL) AS tem FROM compras_anexos ORDER BY id"),
    db.prepare("SELECT status, COUNT(*) AS n FROM compras_req GROUP BY status")
  ]);
  const por = function (l) { const m = {}; (l.results || []).forEach(function (x) { (m[x.numero] = m[x.numero] || []).push(x); }); return m; };
  const I = por(it), E = por(ev), A = por(an);
  let L = (rs.results || []).map(function (r) { delete r.chave; r.itens = I[r.numero] || []; r.eventos = E[r.numero] || []; r.anexos = A[r.numero] || []; return r; });
  if (sit === "abertas") L = L.filter(function (r) { return ABERTOS.includes(r.status); });
  else if (sit !== "todas") L = L.filter(function (r) { return r.status === sit; });
  if (busca) L = L.filter(function (r) {
    return [r.numero, r.solicitante, r.obra, r.obra_desc, r.frota, r.justificativa, r.pedido, r.comprador, r.itens.map(function (x) { return x.descricao; }).join(" ")].join(" ").toLowerCase().indexOf(busca) >= 0;
  });
  const contagem = {}; (ct.results || []).forEach(function (x) { contagem[x.status] = x.n; });
  return resp({ ok: true, quem: data && data.quem, status: STATUS, requisicoes: L, contagem: contagem, hoje: agora().slice(0, 10) });
}

export async function onRequestPost({ request, env, data }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const db = env.DB, quem = (data && data.quem) || "gestao";
  await garantir(db);
  const r = await carregarReq(db, txt(d.numero, 30) || "", false);
  if (!r) return resp({ ok: false, erro: "nao_encontrada", msg: "Requisição não encontrada." }, 404);
  const novo = d.status != null ? String(d.status) : r.status;
  if (!STATUS.includes(novo)) return resp({ ok: false, erro: "status_invalido" }, 400);
  if (novo === "Cancelada" && !txt(d.motivo, 300) && r.status !== "Cancelada") return resp({ ok: false, erro: "sem_motivo", msg: "Informe o motivo do cancelamento." }, 400);
  if (d.previsao && !dia(d.previsao)) return resp({ ok: false, erro: "previsao_invalida", msg: "Data de previsão inválida." }, 400);
  const campos = {
    status: novo,
    comprador: d.assumir ? quem : r.comprador,
    previsao: d.previsao !== undefined ? dia(d.previsao) : r.previsao,
    pedido: d.pedido !== undefined ? txt(d.pedido, 60) : r.pedido,
    obs_suprimentos: d.obs_suprimentos !== undefined ? txt(d.obs_suprimentos, 500) : r.obs_suprimentos,
    motivo: novo === "Cancelada" ? (txt(d.motivo, 300) || r.motivo) : r.motivo
  };
  // quem mexe primeiro numa requisição nova assume a compra
  if (!campos.comprador && novo !== "Nova") campos.comprador = quem;
  const mudou = Object.keys(campos).filter(function (k) { return (campos[k] || null) !== (r[k] || null); });
  if (!mudou.length) return resp({ ok: true, sem_mudanca: true, requisicao: r });
  const obs = mudou.filter(function (k) { return k !== "status"; }).map(function (k) {
    return { comprador: "comprador", previsao: "previsão " + (campos.previsao || "—"), pedido: "pedido " + (campos.pedido || "—"), obs_suprimentos: "observação", motivo: "motivo: " + (campos.motivo || "") }[k];
  }).join(" · ");
  await db.batch([
    db.prepare("UPDATE compras_req SET status = ?2, comprador = ?3, previsao = ?4, pedido = ?5, obs_suprimentos = ?6, motivo = ?7, atualizado_em = ?8, atualizado_por = ?9 WHERE numero = ?1")
      .bind(r.numero, campos.status, campos.comprador, campos.previsao, campos.pedido, campos.obs_suprimentos, campos.motivo, agora(), quem),
    evento(db, r.numero, quem, novo !== r.status ? r.status : null, novo !== r.status ? novo : null, obs || null)
  ]);
  return resp({ ok: true, requisicao: await carregarReq(db, r.numero, false) });
}
