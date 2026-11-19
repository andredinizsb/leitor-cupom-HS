// GET /api/aut/ver?n=AUT-...&k=<chave do colaborador> — situação e canhoto da autorização para quem pediu.
// Só com a chave privada (guardada no celular de quem pediu, ou no link que Suprimentos enviar).
import { resp, semBanco, ERRO_BANCO, carregar, publico } from "../../../lib/aut.js";

const COM_CANHOTO = ["Emitida", "Parcialmente atendida", "Atendida", "Expirada", "Cancelada"];

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const u = new URL(request.url);
  const n = (u.searchParams.get("n") || "").trim(), k = (u.searchParams.get("k") || "").trim();
  if (!n || !k) return resp({ ok: false, erro: "parametros" }, 400);
  const a = await carregar(env.DB, n);
  if (!a || a.chave_solicitante !== k) return resp({ ok: false, erro: "nao_encontrada" }, 404);
  const p = publico(a);
  // canhoto (com a assinatura) só depois de aprovado
  p.assinatura = a.decidido_em && COM_CANHOTO.includes(p.status) ? a.assinatura || null : null;
  p.atendimentos = a.atendimentos.map(function (x) { return { data_cupom: x.data_cupom, estabelecimento: x.estabelecimento, numero_nf: x.numero_nf, valor_total: x.valor_total, parcial: x.parcial }; });
  return resp({ ok: true, autorizacao: p });
}
