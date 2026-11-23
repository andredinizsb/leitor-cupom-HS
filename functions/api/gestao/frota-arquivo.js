// GET /api/gestao/frota-arquivo?id=123 — foto ou PDF da NF / do documento da frota (login do Access, ver _middleware)
import { resp, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { b64ParaBytes } from "../../../lib/rdo.js";
import { comR2Contado } from "../../../lib/fotos.js";

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  env = comR2Contado(env);   // conta as leituras do R2 (teto do plano gratis, lib/fotos.js)
  const id = parseInt(new URL(request.url).searchParams.get("id") || "", 10);
  if (!id) return resp({ ok: false, erro: "sem_id" }, 400);
  const f = await env.DB.prepare("SELECT nome, tipo, r2_key, dados, arquivo FROM frota_arquivos WHERE id = ?1").bind(id).first();
  if (!f) return resp({ ok: false, erro: "nao_encontrado" }, 404);
  if (!f.dados && !f.r2_key) return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\"><body style=\"font:16px system-ui;margin:24px\"><h2>Arquivo guardado no servidor da empresa</h2><p>Para liberar espaço do app, este arquivo foi movido para:</p><p><b>" + String(f.arquivo || "HS GESTAO APP\\FROTA").replace(/[&<>]/g, "") + "</b></p>", { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } });
  const nome = String(f.nome || "arquivo").replace(/[^\w.\- ]/g, "_");
  const h = { "Content-Type": f.tipo || "application/octet-stream", "Content-Disposition": 'inline; filename="' + nome + '"', "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" };
  if (f.r2_key) {
    if (!env.FOTOS) return resp({ ok: false, erro: "r2_desligado" }, 503);
    const o = await env.FOTOS.get(f.r2_key);
    return o ? new Response(o.body, { headers: h }) : resp({ ok: false, erro: "nao_encontrado" }, 404);
  }
  return new Response(b64ParaBytes(f.dados || ""), { headers: h });
}
