// GET /api/gestao/limites — quanto já foi usado de cada teto do plano grátis (D1 e R2). A faixa de aviso da gestão usa isto.
import { resp, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { uso, situacao } from "../../../lib/fotos.js";

export async function onRequestGet({ env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const u = await uso(env), s = situacao(u);
  return resp({ ok: true, itens: s.itens, avisos: s.avisos, cheio: s.cheio, r2_ligado: u.r2_ligado });
}
