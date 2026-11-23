// GET /api/gestao/compras-anexo?id=12 — foto/PDF anexado à requisição (login do Access)
import { resp, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { garantir } from "../../../lib/compras.js";

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  await garantir(env.DB);
  const a = await env.DB.prepare("SELECT tipo, dados, arquivo FROM compras_anexos WHERE id = ?1").bind(parseInt(new URL(request.url).searchParams.get("id") || "", 10) || 0).first();
  if (!a) return resp({ ok: false, erro: "nao_encontrado" }, 404);
  if (!a.dados) return resp({ ok: false, erro: "arquivado", msg: "Anexo guardado no servidor: " + (a.arquivo || "") }, 410);
  const b64 = a.dados.slice(a.dados.indexOf(",") + 1), bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Response(u, { headers: { "Content-Type": a.tipo || "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
}
