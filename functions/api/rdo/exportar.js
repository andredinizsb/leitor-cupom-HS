// GET /api/rdo/exportar — RDOs do app para a planilha (aba RDO / tRDO), no mesmo formato do Jotform.
// Protegido por token: cabeçalho X-HS-Token = variável RDO_TOKEN do projeto (o mesmo valor do arquivo hsgestao_token.txt da pasta de segredos).
import { resp, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { linhaPlanilha, tokenOk } from "../../../lib/rdo.js";

export async function onRequestGet({ request, env }) {
  if (!env.RDO_TOKEN) return resp({ ok: false, erro: "token_nao_configurado" }, 503);
  if (!tokenOk(request.headers.get("X-HS-Token"), env.RDO_TOKEN)) return resp({ ok: false, erro: "nao_autorizado" }, 401);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const rs = await env.DB.prepare("SELECT * FROM rdo ORDER BY data_inicio DESC LIMIT 20000").all();
  return resp({ ok: true, gerado_em: new Date().toISOString(), rdos: (rs.results || []).map(linhaPlanilha) });
}
