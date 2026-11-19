// /api/fotos/<acao> — arquivamento das fotos do RDO e do checklist no servidor da empresa (macro ArquivarFotosApp da planilha).
// Protegido pelo token: cabeçalho X-HS-Token = variável RDO_TOKEN (o mesmo do hsgestao_token.txt). Respostas em texto (TSV), fácil de ler no VBA.
//   GET  pendentes?tipo=rdo                      -> empresa, obra, rdos, fotos (obras que ainda têm fotos guardadas no app)
//   GET  listar?tipo=rdo&empresa=HS&obra=4396    -> id, numero, arquivo, bytes
//   GET  listar?tipo=checklist&dias=90           -> id, numero, arquivo, bytes, frota, data (checklists com mais de N dias)
//   GET  baixar?tipo=rdo&id=123                  -> a foto (bytes)
//   GET  resumo?tipo=rdo&numero=RDO-2026-000001  -> página HTML do RDO/checklist (vai na pasta junto das fotos)
//   POST apagar  {tipo, pasta, itens:[{id, bytes}]} -> apaga do app só as fotos cujo tamanho confere (a linha do RDO fica)
import { resp, semBanco, ERRO_BANCO, txt, agora } from "../../../lib/aut.js";
import { tokenOk, b64ParaBytes } from "../../../lib/rdo.js";
import { TABELAS, SQL_BYTES, DIAS_CHECKLIST, nomeFoto, tsv, resumoHtml } from "../../../lib/fotos.js";

const GUARDADA = "(dados IS NOT NULL OR r2_key IS NOT NULL)";

async function bytesR2(env, f) {
  if (!f.r2_key) return f.bytes;
  if (!env.FOTOS) return -1;
  const h = await env.FOTOS.head(f.r2_key);
  return h ? h.size : -1;
}

export async function onRequest({ request, env, params }) {
  if (!env.RDO_TOKEN) return resp({ ok: false, erro: "token_nao_configurado" }, 503);
  if (!tokenOk(request.headers.get("X-HS-Token"), env.RDO_TOKEN)) return resp({ ok: false, erro: "nao_autorizado" }, 401);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const db = env.DB, u = new URL(request.url), q = u.searchParams, acao = String(params.acao || "");
  const tipo = (acao === "apagar" ? null : q.get("tipo")) || "rdo";

  if (request.method === "POST" && acao === "apagar") {
    let d;
    try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
    const t = TABELAS[d.tipo];
    if (!t) return resp({ ok: false, erro: "tipo_invalido" }, 400);
    const pasta = txt(d.pasta, 300), quando = agora();
    let apagadas = 0, recusadas = 0;
    for (const it of (Array.isArray(d.itens) ? d.itens : []).slice(0, 500)) {
      const f = await db.prepare("SELECT id, r2_key, " + SQL_BYTES + " AS bytes FROM " + t.fotos + " WHERE id = ?1 AND " + GUARDADA).bind(parseInt(it && it.id, 10) || 0).first();
      if (!f || (await bytesR2(env, f)) !== Number(it.bytes)) { recusadas++; continue; }   // tamanho não confere com o que foi gravado: não apaga
      if (f.r2_key && env.FOTOS) await env.FOTOS.delete(f.r2_key);
      await db.prepare("UPDATE " + t.fotos + " SET dados = NULL, r2_key = NULL, arquivado_em = ?2, arquivo = ?3 WHERE id = ?1").bind(f.id, quando, pasta).run();
      apagadas++;
    }
    return tsv([["apagadas", apagadas], ["recusadas", recusadas]]);
  }
  if (request.method !== "GET") return resp({ ok: false, erro: "metodo" }, 405);
  const t = TABELAS[tipo];
  if (!t) return resp({ ok: false, erro: "tipo_invalido" }, 400);

  if (acao === "pendentes") {
    if (tipo !== "rdo") return resp({ ok: false, erro: "so_rdo" }, 400);
    const rs = await db.prepare("SELECT coalesce(r.empresa, '') AS empresa, coalesce(r.obra, '') AS obra, count(DISTINCT r.numero) AS rdos, count(*) AS fotos " +
      "FROM rdo_fotos f JOIN rdo r ON r.numero = f.numero WHERE f.dados IS NOT NULL OR f.r2_key IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2").all();
    return tsv((rs.results || []).map(function (x) { return [x.empresa, x.obra, x.rdos, x.fotos]; }));
  }

  if (acao === "listar") {
    let rs;
    if (tipo === "rdo") {
      const obra = txt(q.get("obra"), 30);
      if (!obra) return resp({ ok: false, erro: "sem_obra" }, 400);
      rs = await db.prepare("SELECT f.id, f.numero, f.ordem, f.etapa, f.tipo, f.r2_key, " + SQL_BYTES.replace(/\b(dados|tamanho)\b/g, "f.$1") + " AS bytes FROM rdo_fotos f JOIN rdo r ON r.numero = f.numero " +
        "WHERE r.obra = ?1 AND coalesce(r.empresa, '') = ?2 AND (f.dados IS NOT NULL OR f.r2_key IS NOT NULL) ORDER BY f.numero, f.ordem").bind(obra, txt(q.get("empresa"), 4)).all();
    } else {
      const dias = Math.max(1, parseInt(q.get("dias") || DIAS_CHECKLIST, 10) || DIAS_CHECKLIST);
      const corte = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
      rs = await db.prepare("SELECT f.id, f.numero, f.ordem, f.secao, f.tipo, f.r2_key, " + SQL_BYTES.replace(/\b(dados|tamanho)\b/g, "f.$1") + " AS bytes, c.frota, substr(c.data_check, 1, 10) AS data " +
        "FROM checklist_fotos f JOIN checklist c ON c.numero = f.numero WHERE c.data_check < ?1 AND (f.dados IS NOT NULL OR f.r2_key IS NOT NULL) ORDER BY f.numero, f.ordem LIMIT 2000").bind(corte).all();
    }
    const out = [];
    for (const f of rs.results || []) {
      const l = [f.id, f.numero, nomeFoto(f, t.grupo), await bytesR2(env, f)];
      if (tipo === "checklist") l.push(f.frota, f.data);
      out.push(l);
    }
    return tsv(out);
  }

  if (acao === "baixar") {
    const f = await db.prepare("SELECT tipo, r2_key, dados FROM " + t.fotos + " WHERE id = ?1").bind(parseInt(q.get("id") || "", 10) || 0).first();
    if (!f || (!f.dados && !f.r2_key)) return resp({ ok: false, erro: "nao_encontrada" }, 404);
    const h = { "Content-Type": f.tipo || "image/jpeg", "Cache-Control": "no-store" };
    if (f.r2_key) {
      const o = env.FOTOS ? await env.FOTOS.get(f.r2_key) : null;
      if (!o) return resp({ ok: false, erro: "nao_encontrada_r2" }, 404);
      return new Response(o.body, { headers: h });
    }
    return new Response(b64ParaBytes(f.dados), { headers: h });
  }

  if (acao === "resumo") {
    const numero = txt(q.get("numero"), 30);
    const r = await db.prepare("SELECT * FROM " + t.pai + " WHERE numero = ?1").bind(numero).first();
    if (!r) return resp({ ok: false, erro: "nao_encontrado" }, 404);
    const fs = await db.prepare("SELECT id, ordem, " + t.grupo + ", legenda, tipo FROM " + t.fotos + " WHERE numero = ?1 ORDER BY ordem").bind(numero).all();
    return new Response(resumoHtml(tipo, r, fs.results || []), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return resp({ ok: false, erro: "acao_desconhecida" }, 404);
}
