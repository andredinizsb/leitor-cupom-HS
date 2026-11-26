// GET /api/gestao/frota-arquivo?id=123 — foto ou PDF da NF / do documento da frota (login do Access, ver _middleware)
// POST /api/gestao/frota-arquivo?doc=12&nome=apolice.pdf — corpo = o arquivo (bytes, Content-Type do arquivo), até 25 MB.
//   Vai para o R2 só de passagem: a macro ArquivarFotosApp (planilha) grava em HS GESTAO APP\FROTA\... e apaga da nuvem.
import { resp, semBanco, ERRO_BANCO, origemOk } from "../../../lib/aut.js";
import { b64ParaBytes } from "../../../lib/rdo.js";
import { comR2Contado } from "../../../lib/fotos.js";
import { gravarArquivoBytes, caminhoServidor, MAX_DOC_BYTES } from "../../../lib/frota.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  env = comR2Contado(env);   // conta as leituras do R2 (teto do plano gratis, lib/fotos.js)
  const id = parseInt(new URL(request.url).searchParams.get("id") || "", 10);
  if (!id) return resp({ ok: false, erro: "sem_id" }, 400);
  const f = await env.DB.prepare("SELECT id, nome, tipo, r2_key, dados, arquivo, arquivado_em FROM frota_arquivos WHERE id = ?1").bind(id).first();
  if (!f) return resp({ ok: false, erro: "nao_encontrado" }, 404);
  if (!f.dados && !f.r2_key) {
    const c = caminhoServidor(f) || String(f.arquivo || "HS GESTAO APP\\FROTA");
    return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\"><body style=\"font:16px system-ui;margin:24px\"><h2>Arquivo guardado no servidor da empresa</h2>" +
      "<p>O arquivo fica só no servidor (não na nuvem). Abra pela rede da empresa:</p><p><b style=\"word-break:break-all\">" + esc(c) + "</b></p>" +
      "<button onclick=\"navigator.clipboard.writeText(document.querySelector('b').textContent).then(function(){this.textContent='Copiado'}.bind(this))\" style=\"font:inherit;padding:8px 14px\">Copiar caminho</button>",
      { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  const nome = String(f.nome || "arquivo").replace(/[^\w.\- ]/g, "_");
  const h = { "Content-Type": f.tipo || "application/octet-stream", "Content-Disposition": 'inline; filename="' + nome + '"', "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" };
  if (f.r2_key) {
    if (!env.FOTOS) return resp({ ok: false, erro: "r2_desligado" }, 503);
    const o = await env.FOTOS.get(f.r2_key);
    return o ? new Response(o.body, { headers: h }) : resp({ ok: false, erro: "nao_encontrado" }, 404);
  }
  return new Response(b64ParaBytes(f.dados || ""), { headers: h });
}

export async function onRequestPost({ request, env }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const q = new URL(request.url).searchParams, doc = parseInt(q.get("doc") || "", 10);
  if (!doc) return resp({ ok: false, erro: "sem_doc" }, 400);
  if (Number(request.headers.get("Content-Length") || 0) > MAX_DOC_BYTES) return resp({ ok: false, erro: "arquivo", msg: "Arquivo maior que 25 MB." }, 413);
  const d = await env.DB.prepare("SELECT id FROM frota_docs WHERE id = ?1 AND ativo = 1").bind(doc).first();
  if (!d) return resp({ ok: false, erro: "nao_encontrado", msg: "Documento não encontrado." }, 404);
  const tipo = String(request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const bytes = new Uint8Array(await request.arrayBuffer());
  const r = await gravarArquivoBytes(env, "DOC:" + doc, q.get("nome") || "", tipo, bytes);
  if (r.erro) return resp({ ok: false, erro: "arquivo", msg: r.erro }, 400);
  return resp({ ok: true, id: r.id, bytes: r.bytes });
}
