// GET /api/frota/exportar — frota do app para a planilha: manutenções (colunas da tManutencoes), pendências (tPendFrota) e documentos (tDocFrota).
// Protegido pelo mesmo token do RDO (cabeçalho X-HS-Token = variável RDO_TOKEN).
import { resp, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { tokenOk } from "../../../lib/rdo.js";
import { linhaManut, linhaPend, linhaDoc, arquivosPorRef, sincronizarPendencias } from "../../../lib/frota.js";

export async function onRequestGet({ request, env }) {
  if (!env.RDO_TOKEN) return resp({ ok: false, erro: "token_nao_configurado" }, 503);
  if (!tokenOk(request.headers.get("X-HS-Token"), env.RDO_TOKEN)) return resp({ ok: false, erro: "nao_autorizado" }, 401);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const db = env.DB;
  await sincronizarPendencias(db, 45);
  const m = (await db.prepare("SELECT * FROM frota_manut WHERE excluido = 0 ORDER BY data DESC LIMIT 20000").all()).results || [];
  const p = (await db.prepare("SELECT * FROM frota_pend ORDER BY id LIMIT 20000").all()).results || [];
  const d = (await db.prepare("SELECT * FROM frota_docs ORDER BY id LIMIT 20000").all()).results || [];
  const am = await arquivosPorRef(db, "MAN:"), ad = await arquivosPorRef(db, "DOC:");
  return resp({ ok: true, gerado_em: new Date().toISOString(),
    manutencoes: m.map(function (x) { return linhaManut(x, am["MAN:" + x.numero]); }),
    pendencias: p.map(linhaPend),
    documentos: d.map(function (x) { return linhaDoc(x, ad["DOC:" + x.id]); }) });
}
