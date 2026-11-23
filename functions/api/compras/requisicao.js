// /api/compras/requisicao — lado do campo (sem login, como o pedido de autorização)
//   POST {solicitante, empresa, destino, obra, obra_desc, frota, prioridade, data_necessaria, justificativa, local_entrega, itens[], anexo?} -> {numero, chave}
//   GET  ?l=REQ-2026-0001:chave,REQ-2026-0002:chave  -> situação das requisições guardadas neste celular
import { resp, origemOk, semBanco, ERRO_BANCO, agora, aleatorio } from "../../../lib/aut.js";
import { garantir, proximaReq, evento, lerRequisicao, carregarReq, publicoReq } from "../../../lib/compras.js";

export async function onRequestPost({ request, env }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const v = lerRequisicao(d);
  if (v.erro) return resp({ ok: false, erro: v.erro, msg: v.msg }, 400);
  const db = env.DB;
  await garantir(db);
  const numero = await proximaReq(db, new Date().getFullYear()), chave = aleatorio(18), r = v.req, quando = agora();
  const ops = [
    db.prepare("INSERT INTO compras_req (numero, criado_em, solicitante, empresa, obra, obra_desc, frota, destino, prioridade, data_necessaria, justificativa, local_entrega, status, atualizado_em, chave) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'Nova', ?2, ?13)")
      .bind(numero, quando, r.solicitante, r.empresa, r.obra, r.obra_desc, r.frota, r.destino, r.prioridade, r.data_necessaria, r.justificativa, r.local_entrega, chave),
    evento(db, numero, r.solicitante, null, "Nova", "enviada pelo app")
  ];
  v.itens.forEach(function (x, i) {
    ops.push(db.prepare("INSERT INTO compras_req_itens (numero, item, descricao, qtd, unidade, obs) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(numero, i + 1, x.descricao, x.qtd, x.unidade, x.obs));
  });
  if (v.anexo) ops.push(db.prepare("INSERT INTO compras_anexos (numero, nome, tipo, dados, criado_em) VALUES (?1, ?2, ?3, ?4, ?5)").bind(numero, v.anexo.nome, v.anexo.tipo, v.anexo.dados, quando));
  await db.batch(ops);
  return resp({ ok: true, numero: numero, chave: chave, status: "Nova" });
}

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const db = env.DB;
  await garantir(db);
  const pares = String(new URL(request.url).searchParams.get("l") || "").split(",").slice(0, 40)
    .map(function (p) { const i = p.lastIndexOf(":"); return i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : null; }).filter(Boolean);
  const out = [];
  for (const p of pares) {
    const r = await carregarReq(db, p[0], true);
    if (r && r.chave === p[1]) out.push(publicoReq(r)); else out.push({ numero: p[0], nao_encontrada: true });
  }
  return resp({ ok: true, requisicoes: out });
}
