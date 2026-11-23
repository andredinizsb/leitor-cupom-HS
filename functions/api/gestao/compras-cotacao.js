// /api/gestao/compras-cotacao — cotação de uma requisição (IT 1.6 etapas 2 a 5). Login do Access.
//   GET  ?numero=REQ-2026-0001  -> requisição, cotações (com preços por item) e fornecedores sugeridos pelo histórico do FX
//   POST {acao, numero, ...}
//     vincular   {item, codigo_fx|null}                       liga o item ao cadastro do FX
//     fornecedor {cnpj?, fornecedor, contato, telefone, email} acrescenta um fornecedor à cotação (requisição Nova passa a Em cotação)
//     enviada    {cot_id}                                     marca que a cotação foi enviada (WhatsApp/e-mail feito pelo comprador)
//     resposta   {cot_id, cond_pagto, prazo_dias, frete_tipo, frete_valor, validade, obs, itens:[{item, preco, impostos, disponivel}]}
//     remover    {cot_id}
//     escolher   {escolhas:[{item, cot_id, preco_negociado?, justificativa?}], excecao?}  regras: 2 cotações ou exceção; justificar se não for o menor custo
import { resp, origemOk, semBanco, ERRO_BANCO, txt, num, agora, soDigitos } from "../../../lib/aut.js";
import { garantir, evento, carregarReq, dia } from "../../../lib/compras.js";

async function cotacoes(db, numero) {
  const [c, i] = await db.batch([
    db.prepare("SELECT * FROM compras_cot WHERE numero = ?1 ORDER BY id").bind(numero),
    db.prepare("SELECT x.* FROM compras_cot_itens x JOIN compras_cot c ON c.id = x.cot_id WHERE c.numero = ?1").bind(numero)
  ]);
  const I = {}; (i.results || []).forEach(function (x) { (I[x.cot_id] = I[x.cot_id] || []).push(x); });
  return (c.results || []).map(function (x) { x.itens = I[x.id] || []; return x; });
}
// custo unitário comparável: preço + impostos não inclusos
function custo(x) { return x && x.disponivel && x.preco != null ? Number(x.preco) + Number(x.impostos || 0) : null; }

export async function onRequestGet({ request, env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const db = env.DB, numero = txt(new URL(request.url).searchParams.get("numero"), 30) || "";
  await garantir(db);
  const r = await carregarReq(db, numero, false);
  if (!r) return resp({ ok: false, erro: "nao_encontrada", msg: "Requisição não encontrada." }, 404);
  const [it2] = await db.batch([db.prepare("SELECT item, escolha_cot, preco_negociado, justificativa FROM compras_req_itens WHERE numero = ?1").bind(numero)]);
  const E = {}; (it2.results || []).forEach(function (x) { E[x.item] = x; });
  r.itens.forEach(function (x) { Object.assign(x, E[x.item] || {}); });
  const cods = r.itens.map(function (x) { return x.codigo_fx; }).filter(Boolean);
  let sug = [], mats = {};
  if (cods.length) {
    const ph = cods.map(function (_, i) { return "?" + (i + 1); }).join(",");
    const [s, m] = await db.batch([
      db.prepare("SELECT p.cnpj, f.nome, f.fantasia, f.contato, f.telefone, f.email, f.cidade, f.uf, COUNT(*) AS itens, max(p.data) AS ultima, sum(p.vezes) AS vezes FROM compras_precos p LEFT JOIN compras_forn f ON f.cnpj = p.cnpj WHERE p.id_fx IN (" + ph + ") GROUP BY p.cnpj ORDER BY itens DESC, ultima DESC LIMIT 12").bind(...cods),
      db.prepare("SELECT p.id_fx, p.cnpj, p.data, p.preco, f.nome FROM compras_precos p LEFT JOIN compras_forn f ON f.cnpj = p.cnpj WHERE p.id_fx IN (" + ph + ") ORDER BY p.data DESC").bind(...cods)
    ]);
    sug = s.results || [];
    (m.results || []).forEach(function (x) { (mats[x.id_fx] = mats[x.id_fx] || []).push(x); });
  }
  return resp({ ok: true, quem: data && data.quem, requisicao: r, cotacoes: await cotacoes(db, numero), sugestoes: sug, historico: mats });
}

export async function onRequestPost({ request, env, data }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const db = env.DB, quem = (data && data.quem) || "gestao", acao = String(d.acao || "");
  await garantir(db);
  const r = await carregarReq(db, txt(d.numero, 30) || "", false);
  if (!r) return resp({ ok: false, erro: "nao_encontrada", msg: "Requisição não encontrada." }, 404);
  if (r.status === "Cancelada" || r.status === "Entregue") return resp({ ok: false, erro: "fechada", msg: "Requisição " + r.status.toLowerCase() + ": não dá para mexer na cotação." }, 409);
  const cotDe = async function (id) { return await db.prepare("SELECT * FROM compras_cot WHERE id = ?1 AND numero = ?2").bind(parseInt(id, 10) || 0, r.numero).first(); };
  const ops = [];

  if (acao === "vincular") {
    const item = parseInt(d.item, 10), cod = d.codigo_fx == null ? null : txt(d.codigo_fx, 20);
    if (!r.itens.some(function (x) { return x.item === item; })) return resp({ ok: false, erro: "item" }, 400);
    if (cod && !(await db.prepare("SELECT 1 FROM compras_mat WHERE id_fx = ?1").bind(cod).first())) return resp({ ok: false, erro: "material", msg: "Material não está no catálogo." }, 400);
    ops.push(db.prepare("UPDATE compras_req_itens SET codigo_fx = ?3 WHERE numero = ?1 AND item = ?2").bind(r.numero, item, cod));
  } else if (acao === "fornecedor") {
    const cnpj = soDigitos(d.cnpj) ? txt(d.cnpj, 20) : null;
    let f = cnpj ? await db.prepare("SELECT * FROM compras_forn WHERE cnpj = ?1").bind(cnpj).first() : null;
    const nome = txt(d.fornecedor, 120) || (f && (f.fantasia || f.nome));
    if (!nome) return resp({ ok: false, erro: "sem_fornecedor", msg: "Informe o fornecedor." }, 400);
    if (cnpj && await db.prepare("SELECT 1 FROM compras_cot WHERE numero = ?1 AND cnpj = ?2").bind(r.numero, cnpj).first()) return resp({ ok: false, erro: "repetido", msg: "Esse fornecedor já está na cotação." }, 409);
    ops.push(db.prepare("INSERT INTO compras_cot (numero, cnpj, fornecedor, contato, telefone, email, criado_por, criado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(r.numero, cnpj, nome, txt(d.contato, 80) || (f && f.contato), txt(d.telefone, 40) || (f && f.telefone), txt(d.email, 120) || (f && f.email), quem, agora()));
    if (r.status === "Nova") {
      ops.push(db.prepare("UPDATE compras_req SET status = 'Em cotação', comprador = coalesce(comprador, ?2), atualizado_em = ?3, atualizado_por = ?2 WHERE numero = ?1").bind(r.numero, quem, agora()));
      ops.push(evento(db, r.numero, quem, "Nova", "Em cotação", "cotação iniciada"));
    }
  } else if (acao === "enviada") {
    const c = await cotDe(d.cot_id); if (!c) return resp({ ok: false, erro: "cotacao" }, 404);
    ops.push(db.prepare("UPDATE compras_cot SET enviada_em = ?2 WHERE id = ?1").bind(c.id, agora()));
  } else if (acao === "remover") {
    const c = await cotDe(d.cot_id); if (!c) return resp({ ok: false, erro: "cotacao" }, 404);
    ops.push(db.prepare("DELETE FROM compras_cot_itens WHERE cot_id = ?1").bind(c.id), db.prepare("DELETE FROM compras_cot WHERE id = ?1").bind(c.id),
      db.prepare("UPDATE compras_req_itens SET escolha_cot = NULL WHERE numero = ?1 AND escolha_cot = ?2").bind(r.numero, c.id));
  } else if (acao === "resposta") {
    const c = await cotDe(d.cot_id); if (!c) return resp({ ok: false, erro: "cotacao" }, 404);
    const frete = ["CIF", "FOB"].includes(d.frete_tipo) ? d.frete_tipo : null;
    if (d.validade && !dia(d.validade)) return resp({ ok: false, erro: "validade", msg: "Validade inválida." }, 400);
    const its = (Array.isArray(d.itens) ? d.itens : []).filter(function (x) { return r.itens.some(function (y) { return y.item === parseInt(x.item, 10); }); });
    if (!its.some(function (x) { return x.disponivel !== false && num(x.preco) > 0; })) return resp({ ok: false, erro: "sem_preco", msg: "Informe o preço de pelo menos um item." }, 400);
    ops.push(db.prepare("UPDATE compras_cot SET respondida_em = coalesce(respondida_em, ?2), cond_pagto = ?3, prazo_dias = ?4, frete_tipo = ?5, frete_valor = ?6, validade = ?7, obs = ?8 WHERE id = ?1")
      .bind(c.id, agora(), txt(d.cond_pagto, 80), parseInt(d.prazo_dias, 10) >= 0 ? parseInt(d.prazo_dias, 10) : null, frete, frete === "FOB" ? num(d.frete_valor) : null, dia(d.validade), txt(d.obs, 300)));
    its.forEach(function (x) {
      const disp = x.disponivel === false ? 0 : 1;
      ops.push(db.prepare("INSERT INTO compras_cot_itens (cot_id, item, preco, impostos, disponivel, obs) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(cot_id, item) DO UPDATE SET preco = ?3, impostos = ?4, disponivel = ?5, obs = ?6")
        .bind(c.id, parseInt(x.item, 10), disp ? num(x.preco) : null, disp ? num(x.impostos) : null, disp, txt(x.obs, 120)));
    });
  } else if (acao === "escolher") {
    const cots = await cotacoes(db, r.numero), resp_ = cots.filter(function (c) { return c.respondida_em; });
    const excecao = txt(d.excecao, 300);
    if (resp_.length < 2 && !excecao) return resp({ ok: false, erro: "duas_cotacoes", msg: "A IT 1.6 pede no mínimo 2 cotações. Registre outra resposta ou informe o motivo da exceção (fabricante, distribuidor ou representante)." }, 400);
    const es = Array.isArray(d.escolhas) ? d.escolhas : [];
    for (const e of es) {
      const item = parseInt(e.item, 10), c = resp_.filter(function (x) { return x.id === parseInt(e.cot_id, 10); })[0];
      if (!r.itens.some(function (y) { return y.item === item; })) return resp({ ok: false, erro: "item" }, 400);
      if (!c) return resp({ ok: false, erro: "cotacao", msg: "Escolha uma cotação respondida." }, 400);
      const meu = custo(c.itens.filter(function (x) { return x.item === item; })[0]);
      if (meu == null) return resp({ ok: false, erro: "indisponivel", msg: "O item " + item + " não tem preço nessa cotação." }, 400);
      const menor = Math.min.apply(null, resp_.map(function (x) { const v = custo(x.itens.filter(function (y) { return y.item === item; })[0]); return v == null ? Infinity : v; }));
      if (meu > menor + 0.005 && !txt(e.justificativa, 300)) return resp({ ok: false, erro: "justificar", item: item, msg: "Item " + item + ": a escolha não é o menor custo. Escreva a justificativa (prazo, qualidade, frete…)." }, 400);
      const neg = num(e.preco_negociado);
      ops.push(db.prepare("UPDATE compras_req_itens SET escolha_cot = ?3, preco_negociado = ?4, justificativa = ?5 WHERE numero = ?1 AND item = ?2")
        .bind(r.numero, item, c.id, neg > 0 ? neg : null, txt(e.justificativa, 300)));
    }
    ops.push(db.prepare("UPDATE compras_req SET excecao = ?2, atualizado_em = ?3, atualizado_por = ?4 WHERE numero = ?1").bind(r.numero, excecao, agora(), quem));
    const nomes = {}; es.forEach(function (e) { const c = resp_.filter(function (x) { return x.id === parseInt(e.cot_id, 10); })[0]; if (c) nomes[c.fornecedor] = 1; });
    ops.push(evento(db, r.numero, quem, null, null, "fornecedor escolhido: " + Object.keys(nomes).join(", ") + (excecao ? " · exceção: " + excecao : "")));
  } else return resp({ ok: false, erro: "acao_invalida" }, 400);

  if (ops.length) await db.batch(ops);
  return resp({ ok: true });
}
