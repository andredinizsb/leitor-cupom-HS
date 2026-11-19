// GET /api/gestao/checklist-foto?id=123 — imagem de uma foto do checklist (login do Access, ver _middleware)
import { resp, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { b64ParaBytes } from "../../../lib/rdo.js";

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const id = parseInt(new URL(request.url).searchParams.get("id") || "", 10);
  if (!id) return resp({ ok: false, erro: "sem_id" }, 400);
  const f = await env.DB.prepare("SELECT tipo, r2_key, dados FROM checklist_fotos WHERE id = ?1").bind(id).first();
  if (!f) return resp({ ok: false, erro: "nao_encontrada" }, 404);
  const h = { "Content-Type": f.tipo || "image/jpeg", "Cache-Control": "private, max-age=86400" };
  if (f.r2_key) {
    if (!env.FOTOS) return resp({ ok: false, erro: "r2_desligado" }, 503);
    const o = await env.FOTOS.get(f.r2_key);
    return o ? new Response(o.body, { headers: h }) : resp({ ok: false, erro: "nao_encontrada" }, 404);
  }
  return new Response(b64ParaBytes(f.dados || ""), { headers: h });
}
