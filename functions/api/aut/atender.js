// POST /api/aut/atender — o colaborador vincula o cupom NFC-e (o que foi comprado de fato) à autorização
import { resp, origemOk, semBanco, ERRO_BANCO, carregar, registrarAtendimento } from "../../../lib/aut.js";

export async function onRequestPost({ request, env }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const a = await carregar(env.DB, String(d.n || "").trim());
  if (!a || !d.k || a.chave_solicitante !== String(d.k)) return resp({ ok: false, erro: "nao_encontrada" }, 404);
  const r = await registrarAtendimento(env.DB, a, d, a.colaborador);
  return resp(r, r.ok ? 200 : 409);
}
