// GET /api/checklist/exportar — checklists do app para a planilha (aba Checklist / tChecklist), no mesmo formato do Jotform.
// Protegido pelo mesmo token do RDO (cabeçalho X-HS-Token = variável RDO_TOKEN).
import { resp, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { tokenOk } from "../../../lib/rdo.js";
import { linhaPlanilha } from "../../../lib/checklist.js";

export async function onRequestGet({ request, env }) {
  if (!env.RDO_TOKEN) return resp({ ok: false, erro: "token_nao_configurado" }, 503);
  if (!tokenOk(request.headers.get("X-HS-Token"), env.RDO_TOKEN)) return resp({ ok: false, erro: "nao_autorizado" }, 401);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const rs = await env.DB.prepare("SELECT * FROM checklist ORDER BY data_check DESC LIMIT 20000").all();
  return resp({ ok: true, gerado_em: new Date().toISOString(), checklists: (rs.results || []).map(linhaPlanilha) });
}
