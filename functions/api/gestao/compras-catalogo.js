// GET /api/gestao/compras-catalogo — catálogo do FX no app (login do Access)
//   ?q=cabo 10mm      -> materiais já comprados que têm todas as palavras (até 25), com nº de fornecedores e último preço
//   ?id=12345         -> o material e o histórico por fornecedor (último preço, data, NF, vezes)
//   ?forn=eletro      -> fornecedores (nome, CNPJ, cidade), com nº de itens já comprados deles
import { resp, semBanco, ERRO_BANCO, txt } from "../../../lib/aut.js";
import { garantir, norm } from "../../../lib/compras.js";

// só letras e números (ex.: "10mm²" busca "10mm"; "c/" e "-" são ignorados)
function palavras(q) { return norm(q).replace(/[^a-z0-9]+/g, " ").split(" ").filter(function (p) { return p.length >= 2; }).slice(0, 6); }

export async function onRequestGet({ request, env }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const db = env.DB, p = new URL(request.url).searchParams;
  await garantir(db);
  if (p.get("id")) {
    const id = txt(p.get("id"), 20);
    const m = await db.prepare("SELECT id_fx, descricao, marca, categoria, unidade FROM compras_mat WHERE id_fx = ?1").bind(id).first();
    const rs = await db.prepare("SELECT p.cnpj, p.data, p.preco, p.qtd, p.nf, p.vezes, f.nome, f.fantasia, f.telefone, f.contato, f.email, f.cidade, f.uf FROM compras_precos p LEFT JOIN compras_forn f ON f.cnpj = p.cnpj WHERE p.id_fx = ?1 ORDER BY p.data DESC LIMIT 30").bind(id).all();
    return resp({ ok: true, material: m, precos: rs.results || [] });
  }
  if (p.get("forn") != null) {
    const ws = palavras(p.get("forn"));
    if (!ws.length) return resp({ ok: true, fornecedores: [] });
    const rs = await db.prepare("SELECT f.cnpj, f.nome, f.fantasia, f.contato, f.telefone, f.email, f.cidade, f.uf, (SELECT COUNT(*) FROM compras_precos x WHERE x.cnpj = f.cnpj) AS itens FROM compras_forn f WHERE " +
      ws.map(function (_, i) { return "f.busca LIKE ?" + (i + 1); }).join(" AND ") + " ORDER BY itens DESC LIMIT 20").bind(...ws.map(function (w) { return "%" + w + "%"; })).all();
    return resp({ ok: true, fornecedores: rs.results || [] });
  }
  const ws = palavras(p.get("q"));
  if (!ws.length) return resp({ ok: true, materiais: [] });
  const rs = await db.prepare("SELECT m.id_fx, m.descricao, m.marca, m.categoria, m.unidade, (SELECT COUNT(*) FROM compras_precos x WHERE x.id_fx = m.id_fx) AS fornecedores, " +
    "(SELECT x.preco FROM compras_precos x WHERE x.id_fx = m.id_fx ORDER BY x.data DESC LIMIT 1) AS ultimo_preco, (SELECT max(x.data) FROM compras_precos x WHERE x.id_fx = m.id_fx) AS ultima_compra " +
    "FROM compras_mat m WHERE " + ws.map(function (_, i) { return "m.busca LIKE ?" + (i + 1); }).join(" AND ") + " ORDER BY ultima_compra DESC LIMIT 25").bind(...ws.map(function (w) { return "%" + w + "%"; })).all();
  return resp({ ok: true, materiais: rs.results || [] });
}
