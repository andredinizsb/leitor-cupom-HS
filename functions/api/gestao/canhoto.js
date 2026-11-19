// GET /api/gestao/canhoto?n=AUT-... — autorização completa (com a assinatura) para ver / gerar o PDF do canhoto
import { resp, semBanco, ERRO_BANCO, carregar, publico } from "../../../lib/aut.js";

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const n = (new URL(request.url).searchParams.get("n") || "").trim();
  const a = await carregar(env.DB, n);
  if (!a) return resp({ ok: false, erro: "nao_encontrada" }, 404);
  const p = publico(a);
  p.assinatura = a.assinatura || null;
  p.chave_solicitante = a.chave_solicitante;
  p.decidido_por = a.decidido_por;
  return resp({ ok: true, autorizacao: p });
}
