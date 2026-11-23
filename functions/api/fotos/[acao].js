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
import { relatorioHtml, dadosRelatorio, dataUri } from "../../../lib/relatorio.js";
import { ITENS } from "../../../lib/checklist.js";
import { TABELAS, SQL_BYTES, DIAS_CHECKLIST, DIAS_FROTA, nomeFoto, nomeArquivoFrota, tsv, resumoHtml, resumoFrotaHtml, uso, situacao, comR2Contado } from "../../../lib/fotos.js";
//   GET  listar?tipo=frota&dias=180              -> id, ref, arquivo, bytes, frota, data (NF/PDF/fotos da frota; o último arquivo de cada documento fica)
//   GET  resumo?tipo=frota&numero=MAN:MAN-2026-000001 (ou DOC:12)
//   GET  uso                                     -> "maior <pct>" (maior % de espaço usado, D1 ou R2) e cada teto: nome, usado, teto, pct
//   GET  listar?tipo=rdo&dias=180                -> RDOs de qualquer obra com mais de N dias (limpeza por espaço; a macro decide N pelo uso)

const GUARDADA = "(dados IS NOT NULL OR r2_key IS NOT NULL)";
// só arquiva (e apaga do app) o que já tem o relatório final salvo no servidor
const COM_RELATORIO = (tipo, col) => "EXISTS (SELECT 1 FROM relatorios x WHERE x.tipo = '" + tipo + "' AND x.numero = " + col + ")";
//   GET  relatorios?tipo=rdo|checklist|frota    -> registros sem relatório salvo: numero, empresa|frota, obra, data
//   GET  relatorio?tipo=rdo&numero=...          -> relatório final (HTML A4, fotos embutidas) que a planilha grava em PDF
//   POST relatorio-salvo {tipo, numero, arquivo} -> marca o relatório como salvo no servidor

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
  env = comR2Contado(env);
  const db = env.DB, u = new URL(request.url), q = u.searchParams, acao = String(params.acao || "");
  const tipo = (acao === "apagar" ? null : q.get("tipo")) || "rdo";
  // tabela dos relatórios salvos no servidor (cria sozinha na 1ª vez; nas outras não faz nada)
  if (/^(relatorios|relatorio-salvo|listar)$/.test(acao)) await db.prepare("CREATE TABLE IF NOT EXISTS relatorios (tipo TEXT NOT NULL, numero TEXT NOT NULL, salvo_em TEXT, arquivo TEXT, PRIMARY KEY (tipo, numero))").run();

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
  if (request.method === "POST" && acao === "relatorio-salvo") {
    let d;
    try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
    if (!TABELAS[d.tipo] || !txt(d.numero, 30)) return resp({ ok: false, erro: "parametros" }, 400);
    await db.prepare("INSERT INTO relatorios (tipo, numero, salvo_em, arquivo) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(tipo, numero) DO UPDATE SET salvo_em = ?3, arquivo = ?4")
      .bind(d.tipo, txt(d.numero, 30), agora(), txt(d.arquivo, 300)).run();
    return tsv([["ok", 1]]);
  }
  if (request.method !== "GET") return resp({ ok: false, erro: "metodo" }, 405);
  if (acao === "relatorios") {
    // registros que ainda não têm o relatório salvo no servidor: numero, a, b, data (rdo: empresa, obra | checklist/frota: frota)
    const sql = {
      rdo: "SELECT r.numero, coalesce(r.empresa, '') AS a, coalesce(r.obra, '') AS b, substr(r.data_inicio, 1, 10) AS d FROM rdo r WHERE NOT EXISTS (SELECT 1 FROM relatorios x WHERE x.tipo = 'rdo' AND x.numero = r.numero) ORDER BY r.numero",
      checklist: "SELECT c.numero, coalesce(c.frota, '') AS a, '' AS b, substr(c.data_check, 1, 10) AS d FROM checklist c WHERE NOT EXISTS (SELECT 1 FROM relatorios x WHERE x.tipo = 'checklist' AND x.numero = c.numero) ORDER BY c.numero",
      frota: "SELECT m.numero, coalesce(m.frota, '') AS a, '' AS b, substr(m.data, 1, 10) AS d FROM frota_manut m WHERE m.excluido = 0 AND NOT EXISTS (SELECT 1 FROM relatorios x WHERE x.tipo = 'frota' AND x.numero = m.numero) ORDER BY m.numero"
    }[tipo];
    if (!sql) return resp({ ok: false, erro: "tipo_invalido" }, 400);
    const rs = await db.prepare(sql + " LIMIT " + Math.min(200, Math.max(1, parseInt(q.get("max") || "60", 10) || 60))).all();
    return tsv((rs.results || []).map(function (x) { return [x.numero, x.a, x.b, x.d]; }));
  }
  if (acao === "relatorio") {
    // relatório completo com as fotos embutidas (a planilha grava em PDF no servidor; abre sem internet e sem login)
    const d = await dadosRelatorio(env, tipo, txt(q.get("numero"), 30));
    if (!d) return resp({ ok: false, erro: "nao_encontrado" }, 404);
    const fotos = [];
    for (const f of d.fotos) fotos.push({ titulo: f.titulo, tipo: f.tipo, arquivo: f.arquivo, src: f.tem ? (/^image\//.test(f.tipo) ? await dataUri(env, f) : "anexo") : null });
    return new Response(relatorioHtml(tipo, d.reg, { fotos: fotos, base: u.origin, itens: ITENS }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (acao === "uso") {
    const s = situacao(await uso(env)), espaco = s.itens.filter(function (i) { return !/antes de passar|no mês/.test(i.nome); });
    return tsv([["maior", Math.max.apply(null, espaco.map(function (i) { return i.pct; }))]].concat(s.itens.map(function (i) { return [i.nome, i.usado, i.teto, i.pct]; })));
  }
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
      const obra = txt(q.get("obra"), 30), diasR = parseInt(q.get("dias") || "", 10);
      const sel = "SELECT f.id, f.numero, f.ordem, f.etapa, f.tipo, f.r2_key, " + SQL_BYTES.replace(/\b(dados|tamanho)\b/g, "f.$1") + " AS bytes, coalesce(r.empresa, '') AS empresa, coalesce(r.obra, '') AS obra " +
        "FROM rdo_fotos f JOIN rdo r ON r.numero = f.numero WHERE (f.dados IS NOT NULL OR f.r2_key IS NOT NULL) AND " + COM_RELATORIO("rdo", "f.numero") + " AND ";
      if (obra) rs = await db.prepare(sel + "r.obra = ?1 AND coalesce(r.empresa, '') = ?2 ORDER BY f.numero, f.ordem").bind(obra, txt(q.get("empresa"), 4)).all();
      else if (diasR > 0) rs = await db.prepare(sel + "r.data_inicio < ?1 ORDER BY f.numero, f.ordem LIMIT 2000").bind(new Date(Date.now() - diasR * 864e5).toISOString().slice(0, 10)).all();
      else return resp({ ok: false, erro: "sem_obra_ou_dias" }, 400);
    } else if (tipo === "frota") {
      // NF/PDF/fotos da frota com mais de N dias; o arquivo mais recente de cada DOCUMENTO (CRLV etc.) fica no app
      const dias = Math.max(1, parseInt(q.get("dias") || DIAS_FROTA, 10) || DIAS_FROTA);
      rs = await db.prepare("SELECT a.id, a.ref AS numero, a.nome, a.tipo, a.r2_key, " + SQL_BYTES.replace(/\b(dados|tamanho)\b/g, "a.$1") + " AS bytes, " +
        "coalesce(m.frota, d.frota, '') AS frota, substr(a.criado_em, 1, 10) AS data FROM frota_arquivos a " +
        "LEFT JOIN frota_manut m ON a.ref = 'MAN:' || m.numero LEFT JOIN frota_docs d ON a.ref = 'DOC:' || d.id " +
        "WHERE (a.dados IS NOT NULL OR a.r2_key IS NOT NULL) AND a.criado_em < ?1 " +
        "AND NOT (a.ref LIKE 'DOC:%' AND a.id = (SELECT max(x.id) FROM frota_arquivos x WHERE x.ref = a.ref)) " +
        "AND (a.ref NOT LIKE 'MAN:%' OR " + COM_RELATORIO("frota", "substr(a.ref, 5)") + ") ORDER BY a.ref, a.id LIMIT 2000")
        .bind(new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10)).all();
    } else {
      const dias = Math.max(1, parseInt(q.get("dias") || DIAS_CHECKLIST, 10) || DIAS_CHECKLIST);
      const corte = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
      rs = await db.prepare("SELECT f.id, f.numero, f.ordem, f.secao, f.tipo, f.r2_key, " + SQL_BYTES.replace(/\b(dados|tamanho)\b/g, "f.$1") + " AS bytes, c.frota, substr(c.data_check, 1, 10) AS data " +
        "FROM checklist_fotos f JOIN checklist c ON c.numero = f.numero WHERE c.data_check < ?1 AND (f.dados IS NOT NULL OR f.r2_key IS NOT NULL) AND " + COM_RELATORIO("checklist", "f.numero") + " ORDER BY f.numero, f.ordem LIMIT 2000").bind(corte).all();
    }
    const out = [];
    for (const f of rs.results || []) {
      const l = [f.id, f.numero, tipo === "frota" ? nomeArquivoFrota(f) : nomeFoto(f, t.grupo), await bytesR2(env, f)];
      if (tipo === "rdo") l.push(f.empresa, f.obra); else l.push(f.frota, f.data);
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

  if (acao === "resumo" && tipo === "frota") {
    const ref = txt(q.get("numero"), 60), m = /^(MAN|DOC):(.+)$/.exec(ref);
    if (!m) return resp({ ok: false, erro: "ref_invalida" }, 400);
    const det = m[1] === "MAN" ? await db.prepare("SELECT * FROM frota_manut WHERE numero = ?1").bind(m[2]).first()
      : await db.prepare("SELECT * FROM frota_docs WHERE id = ?1").bind(parseInt(m[2], 10) || 0).first();
    const fs = await db.prepare("SELECT id, nome, tipo FROM frota_arquivos WHERE ref = ?1 ORDER BY id").bind(ref).all();
    return new Response(resumoFrotaHtml(ref, det, fs.results || []), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
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
