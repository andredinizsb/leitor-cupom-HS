// /api/gestao/frota-docs — documentos da frota com vencimento (CRLV, seguro, laudos, tacógrafo...) — login do Access, ver _middleware
// GET: lista.   POST { id?, frota, veiculo, documento, numero, emissao, vencimento, responsavel, obs, arquivo: { nome, dados } } | { acao: "excluir", id }
import { resp, origemOk, semBanco, ERRO_BANCO, txt, agora } from "../../../lib/aut.js";
import { dia, frotaDe, conferirArquivo, gravarArquivo, arquivosPorRef } from "../../../lib/frota.js";

export async function onRequestGet({ env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const rs = await env.DB.prepare("SELECT * FROM frota_docs WHERE ativo = 1 ORDER BY (vencimento IS NULL), vencimento, frota, documento LIMIT 3000").all();
  const arqs = await arquivosPorRef(env.DB, "DOC:");
  return resp({ ok: true, quem: data && data.quem, hoje: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10),
    documentos: (rs.results || []).map(function (x) { return Object.assign({}, x, { arquivo: arqs["DOC:" + x.id] || null }); }) });
}

export async function onRequestPost({ request, env, data }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const quem = (data && data.quem) || "", db = env.DB, quando = agora();
  let id = parseInt(d.id, 10) || null;
  if (d.acao === "excluir") {
    const r = await db.prepare("UPDATE frota_docs SET ativo = 0, atualizado_em = ?2, atualizado_por = ?3 WHERE id = ?1").bind(id, quando, quem).run();
    return r.meta && r.meta.changes ? resp({ ok: true }) : resp({ ok: false, erro: "nao_encontrado" }, 404);
  }
  const documento = txt(d.documento, 120);
  if (!documento) return resp({ ok: false, erro: "dados", msg: "Informe o documento." }, 400);
  const v = frotaDe(d.veiculo), veiculo = txt(d.veiculo, 120), frota = txt(d.frota, 20) || v.frota || null;
  if (!frota && !veiculo) return resp({ ok: false, erro: "dados", msg: "Informe o veículo ou o equipamento." }, 400);
  const a = conferirArquivo(env, d.arquivo);
  if (!a.ok) return resp({ ok: false, erro: "arquivo", msg: a.msg }, 400);
  const val = [frota, veiculo, documento, txt(d.numero, 60), dia(d.emissao), dia(d.vencimento), txt(d.responsavel, 80), txt(d.obs, 500), quando, quem];
  if (id) {
    const ok = await db.prepare("UPDATE frota_docs SET frota = ?2, veiculo = ?3, documento = ?4, numero = ?5, emissao = ?6, vencimento = ?7, responsavel = ?8, obs = ?9, atualizado_em = ?10, atualizado_por = ?11 WHERE id = ?1 AND ativo = 1")
      .bind(id, ...val).run();
    if (!(ok.meta && ok.meta.changes)) return resp({ ok: false, erro: "nao_encontrado", msg: "Documento não encontrado." }, 404);
  } else {
    const r = await db.prepare("INSERT INTO frota_docs (frota, veiculo, documento, numero, emissao, vencimento, responsavel, obs, atualizado_em, atualizado_por) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
      .bind(...val).run();
    id = r.meta && r.meta.last_row_id;
  }
  if (a.arq) await gravarArquivo(env, "DOC:" + id, a.arq);
  return resp({ ok: true, id: id });
}
