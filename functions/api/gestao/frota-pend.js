// /api/gestao/frota-pend — pendências da oficina (nascem dos problemas do checklist) — login do Access, ver _middleware
// GET: abre as pendências novas dos checklists e devolve a lista.   POST { id, status, resolvida_em, os_obs }
import { resp, origemOk, semBanco, ERRO_BANCO, txt, agora } from "../../../lib/aut.js";
import { dia, sincronizarPendencias, STATUS_PEND } from "../../../lib/frota.js";

export async function onRequestGet({ env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const novas = await sincronizarPendencias(env.DB, 45);
  const rs = await env.DB.prepare("SELECT * FROM frota_pend ORDER BY CASE status WHEN 'Aberta' THEN 1 WHEN 'Em andamento' THEN 2 WHEN 'Aguardando peça' THEN 2 ELSE 3 END, aberta_em DESC, id DESC LIMIT 3000").all();
  return resp({ ok: true, quem: data && data.quem, novas: novas, status: STATUS_PEND, pendencias: rs.results || [] });
}

export async function onRequestPost({ request, env, data }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const id = parseInt(d.id, 10), st = STATUS_PEND.includes(d.status) ? d.status : null;
  if (!id || !st) return resp({ ok: false, erro: "dados", msg: "Escolha o status." }, 400);
  const resolvida = st === "Resolvida" ? (dia(d.resolvida_em) || new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)) : null;
  const r = await env.DB.prepare("UPDATE frota_pend SET status = ?2, resolvida_em = ?3, os_obs = ?4, atualizado_em = ?5, atualizado_por = ?6 WHERE id = ?1")
    .bind(id, st, resolvida, txt(d.os_obs, 500), agora(), (data && data.quem) || "").run();
  if (!(r.meta && r.meta.changes)) return resp({ ok: false, erro: "nao_encontrada", msg: "Pendência não encontrada." }, 404);
  return resp({ ok: true, pendencia: await env.DB.prepare("SELECT * FROM frota_pend WHERE id = ?1").bind(id).first() });
}
