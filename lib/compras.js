// HS Compras (fase C1: requisição de material). Tabelas no D1 com prefixo compras_; criadas sozinhas na 1ª chamada.
import { txt, num, agora } from "./aut.js";

export const STATUS = ["Nova", "Em cotação", "Aguardando aprovação", "Pedido emitido", "Entregue parcial", "Entregue", "Cancelada"];
export const ABERTOS = ["Nova", "Em cotação", "Aguardando aprovação", "Pedido emitido", "Entregue parcial"];
export const PRIORIDADES = ["Normal", "Alta", "Urgente"];
export const DESTINOS = ["Obra", "Frota", "Estoque"];
const MAX_ANEXO = 700000;   // foto já reduzida no celular (~500 KB)

const SQL = [
  "CREATE TABLE IF NOT EXISTS compras_req (numero TEXT PRIMARY KEY, criado_em TEXT NOT NULL, solicitante TEXT NOT NULL, empresa TEXT, obra TEXT, obra_desc TEXT, frota TEXT, destino TEXT, prioridade TEXT, data_necessaria TEXT, justificativa TEXT, local_entrega TEXT, status TEXT NOT NULL, comprador TEXT, previsao TEXT, pedido TEXT, obs_suprimentos TEXT, motivo TEXT, atualizado_em TEXT, atualizado_por TEXT, chave TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS compras_req_itens (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL, item INTEGER NOT NULL, descricao TEXT NOT NULL, qtd REAL, unidade TEXT, codigo_fx TEXT, obs TEXT)",
  "CREATE INDEX IF NOT EXISTS ix_compras_req_itens ON compras_req_itens(numero)",
  "CREATE TABLE IF NOT EXISTS compras_eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL, em TEXT NOT NULL, por TEXT, de TEXT, para TEXT, obs TEXT)",
  "CREATE INDEX IF NOT EXISTS ix_compras_eventos ON compras_eventos(numero)",
  "CREATE TABLE IF NOT EXISTS compras_anexos (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL, nome TEXT, tipo TEXT, dados TEXT, criado_em TEXT, arquivado_em TEXT, arquivo TEXT)",
  "CREATE TABLE IF NOT EXISTS compras_contador (ano INTEGER PRIMARY KEY, ultimo INTEGER NOT NULL)",
  // C2 · catálogo vindo do FX (macro EnviarCatalogoApp): materiais já comprados, fornecedores e último preço por material × fornecedor
  "CREATE TABLE IF NOT EXISTS compras_mat (id_fx TEXT PRIMARY KEY, descricao TEXT NOT NULL, marca TEXT, categoria TEXT, unidade TEXT, busca TEXT)",
  "CREATE TABLE IF NOT EXISTS compras_forn (cnpj TEXT PRIMARY KEY, nome TEXT NOT NULL, fantasia TEXT, contato TEXT, telefone TEXT, email TEXT, cidade TEXT, uf TEXT, busca TEXT)",
  "CREATE TABLE IF NOT EXISTS compras_precos (id_fx TEXT NOT NULL, cnpj TEXT NOT NULL, data TEXT, preco REAL, qtd REAL, nf TEXT, vezes INTEGER, PRIMARY KEY (id_fx, cnpj))",
  "CREATE INDEX IF NOT EXISTS ix_compras_precos_cnpj ON compras_precos(cnpj)",
  // C2 · cotação: uma linha por fornecedor consultado; preços por item da requisição
  "CREATE TABLE IF NOT EXISTS compras_cot (id INTEGER PRIMARY KEY AUTOINCREMENT, numero TEXT NOT NULL, cnpj TEXT, fornecedor TEXT NOT NULL, contato TEXT, telefone TEXT, email TEXT, enviada_em TEXT, respondida_em TEXT, cond_pagto TEXT, prazo_dias INTEGER, frete_tipo TEXT, frete_valor REAL, validade TEXT, obs TEXT, criado_por TEXT, criado_em TEXT)",
  "CREATE INDEX IF NOT EXISTS ix_compras_cot ON compras_cot(numero)",
  "CREATE TABLE IF NOT EXISTS compras_cot_itens (cot_id INTEGER NOT NULL, item INTEGER NOT NULL, preco REAL, impostos REAL, disponivel INTEGER NOT NULL DEFAULT 1, obs TEXT, PRIMARY KEY (cot_id, item))",
  // C3 · pedido de compra (um por fornecedor escolhido) e parâmetros vindos da aba Parametros da planilha
  "CREATE TABLE IF NOT EXISTS compras_pc (numero TEXT PRIMARY KEY, req TEXT NOT NULL, cot_id INTEGER, empresa TEXT, cnpj TEXT, fornecedor TEXT NOT NULL, contato TEXT, telefone TEXT, email TEXT, cond_pagto TEXT, prazo_dias INTEGER, frete_tipo TEXT, frete_valor REAL, destino TEXT, obra TEXT, frota TEXT, local_entrega TEXT, obs TEXT, total REAL, status TEXT NOT NULL, criado_em TEXT, criado_por TEXT, aprovador_nome TEXT, aprovado_por TEXT, aprovado_em TEXT, assinatura TEXT, motivo TEXT, enviado_em TEXT, data_prometida TEXT, confirmado_em TEXT, atualizado_em TEXT)",
  "CREATE INDEX IF NOT EXISTS ix_compras_pc_req ON compras_pc(req)",
  "CREATE TABLE IF NOT EXISTS compras_pc_itens (numero TEXT NOT NULL, item INTEGER NOT NULL, req_item INTEGER, codigo_fx TEXT, descricao TEXT NOT NULL, qtd REAL, unidade TEXT, preco REAL, impostos REAL, total REAL, PRIMARY KEY (numero, item))",
  "CREATE TABLE IF NOT EXISTS compras_pc_contador (dia TEXT PRIMARY KEY, ultimo INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS compras_config (chave TEXT PRIMARY KEY, valor TEXT)",
  // C4 · recebimento (escritório ou obra), item a item
  "CREATE TABLE IF NOT EXISTS compras_receb (id INTEGER PRIMARY KEY AUTOINCREMENT, pc TEXT NOT NULL, item INTEGER NOT NULL, qtd REAL NOT NULL, conforme TEXT, obs TEXT, nf TEXT, recebido_por TEXT, origem TEXT, em TEXT)",
  "CREATE INDEX IF NOT EXISTS ix_compras_receb ON compras_receb(pc)",
  // conferência: o que as NFs de entrada do FX trouxeram para cada item de pedido (mesmo fornecedor e código, a partir da data do pedido) — vem da macro
  "CREATE TABLE IF NOT EXISTS compras_nf (pc TEXT NOT NULL, item INTEGER NOT NULL, qtd_nf REAL, nfs TEXT, ultima TEXT, preco_nf REAL, PRIMARY KEY (pc, item))"
];
export const STATUS_PC = ["Aguardando aprovação", "Aprovado", "Enviado", "Confirmado", "Recebido parcial", "Recebido", "Recusado", "Cancelado"];

// registra o recebimento de um pedido; atualiza a situação do pedido e da requisição. itens: [{item, qtd, conforme:"Sim"|"Não", obs}]
export async function receber(db, numero, d, quem, origem) {
  const p = await db.prepare("SELECT * FROM compras_pc WHERE numero = ?1").bind(String(numero || "")).first();
  if (!p) return { st: 404, erro: "nao_encontrado", msg: "Pedido não encontrado." };
  if (!["Aprovado", "Enviado", "Confirmado", "Recebido parcial"].includes(p.status)) return { st: 409, erro: "status", msg: "Pedido " + p.status.toLowerCase() + ": não dá para receber." };
  const its = (await db.prepare("SELECT i.item, i.qtd, i.descricao, coalesce((SELECT sum(r.qtd) FROM compras_receb r WHERE r.pc = i.numero AND r.item = i.item), 0) AS recebido FROM compras_pc_itens i WHERE i.numero = ?1").bind(p.numero).all()).results || [];
  const ent = (Array.isArray(d.itens) ? d.itens : []).map(function (x) { return { item: parseInt(x.item, 10), qtd: num(x.qtd), conforme: x.conforme === "Não" ? "Não" : "Sim", obs: txt(x.obs, 200) }; }).filter(function (x) { return x.qtd > 0; });
  if (!ent.length) return { st: 400, erro: "sem_qtd", msg: "Informe a quantidade recebida de pelo menos um item." };
  for (const e of ent) {
    const it = its.filter(function (x) { return x.item === e.item; })[0];
    if (!it) return { st: 400, erro: "item", msg: "Item " + e.item + " não está no pedido." };
    if (e.qtd > Number(it.qtd) - Number(it.recebido) + 0.0001) return { st: 400, erro: "excede", msg: "Item " + e.item + ": falta receber só " + String(Math.max(0, Number(it.qtd) - Number(it.recebido))).replace(".", ",") + "." };
    if (e.conforme === "Não" && !e.obs) return { st: 400, erro: "sem_obs", msg: "Item " + e.item + ": diga o que está errado (não conforme)." };
    it.recebido = Number(it.recebido) + e.qtd;
  }
  const quando = agora(), nf = txt(d.nf, 30), completo = its.every(function (x) { return Number(x.recebido) >= Number(x.qtd) - 0.0001; }), novo = completo ? "Recebido" : "Recebido parcial";
  const ops = ent.map(function (e) { return db.prepare("INSERT INTO compras_receb (pc, item, qtd, conforme, obs, nf, recebido_por, origem, em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)").bind(p.numero, e.item, e.qtd, e.conforme, e.obs, nf, quem, origem, quando); });
  ops.push(db.prepare("UPDATE compras_pc SET status = ?2, atualizado_em = ?3 WHERE numero = ?1").bind(p.numero, novo, quando));
  const nc = ent.filter(function (e) { return e.conforme === "Não"; }).length;
  ops.push(evento(db, p.req, quem, null, null, "recebido do pedido " + p.numero + (nf ? " (NF " + nf + ")" : "") + ": " + ent.length + " item(ns)" + (nc ? ", " + nc + " não conforme" : "") + " · " + origem));
  // requisição: Entregue quando todos os pedidos ativos foram recebidos
  const outros = ((await db.prepare("SELECT status FROM compras_pc WHERE req = ?1 AND numero <> ?2 AND status NOT IN ('Recusado', 'Cancelado')").bind(p.req, p.numero).all()).results || []).map(function (x) { return x.status; });
  const r = await db.prepare("SELECT status FROM compras_req WHERE numero = ?1").bind(p.req).first();
  const rn = outros.concat([novo]).every(function (s) { return s === "Recebido"; }) ? "Entregue" : "Entregue parcial";
  if (r && r.status !== rn && r.status !== "Cancelada") { ops.push(db.prepare("UPDATE compras_req SET status = ?2, atualizado_em = ?3 WHERE numero = ?1").bind(p.req, rn, quando)); ops.push(evento(db, p.req, quem, r.status, rn, null)); }
  await db.batch(ops);
  return { ok: true, status: novo };
}

// pedidos de uma requisição com o que já foi recebido (para o celular do solicitante e para a gestão)
export async function pedidosComReceb(db, where, bind) {
  const L = (await db.prepare("SELECT numero, req, fornecedor, status, total, data_prometida, telefone, contato, email, cond_pagto, frete_tipo, empresa, local_entrega, aprovador_nome, aprovado_em, enviado_em, motivo, criado_em, obra, frota, destino FROM compras_pc " + where + " ORDER BY criado_em DESC LIMIT 300").bind(...bind).all()).results || [];
  if (!L.length) return L;
  const ph = L.map(function (_, i) { return "?" + (i + 1); }).join(","), ns = L.map(function (p) { return p.numero; });
  const [it, rc] = await db.batch([db.prepare("SELECT * FROM compras_pc_itens WHERE numero IN (" + ph + ") ORDER BY numero, item").bind(...ns),
    db.prepare("SELECT * FROM compras_receb WHERE pc IN (" + ph + ") ORDER BY id").bind(...ns)]);
  const I = {}, R = {};
  (rc.results || []).forEach(function (x) { (R[x.pc] = R[x.pc] || []).push(x); });
  (it.results || []).forEach(function (x) { x.recebido = (R[x.numero] || []).filter(function (r) { return r.item === x.item; }).reduce(function (s, r) { return s + Number(r.qtd); }, 0); (I[x.numero] = I[x.numero] || []).push(x); });
  return L.map(function (p) { p.itens = I[p.numero] || []; p.recebimentos = R[p.numero] || []; return p; });
}
// nº do pedido no estilo da planilha (ddmmaa) + 9 + sequência do dia: 231126901 — nunca coincide com os da planilha (ddmmaaaa+seq e ddmmaa+seq)
export async function proximoPedido(db) {
  const h = new Date(Date.now() - 3 * 3600e3).toISOString(), dia_ = h.slice(8, 10) + h.slice(5, 7) + h.slice(2, 4);
  const r = await db.prepare("INSERT INTO compras_pc_contador (dia, ultimo) VALUES (?1, 1) ON CONFLICT(dia) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo").bind(dia_).first();
  return dia_ + "9" + String(r.ultimo).padStart(2, "0");
}
export async function config(db) {
  const rs = await db.prepare("SELECT chave, valor FROM compras_config").all(), c = {};
  (rs.results || []).forEach(function (x) { c[x.chave] = x.valor; });
  return { limite: Number(String(c.LimiteAprovacao || "0").replace(",", ".")) || 0, aprovadores: String(c.Aprovadores || "").split(/[;\n]/).map(function (s) { return s.trim(); }).filter(Boolean) };
}
// colunas novas em tabelas que já existem no D1 (fase C1): o erro "duplicate column" é ignorado
const ALTER = ["compras_req_itens ADD COLUMN escolha_cot INTEGER", "compras_req_itens ADD COLUMN preco_negociado REAL", "compras_req_itens ADD COLUMN justificativa TEXT",
  "compras_req ADD COLUMN excecao TEXT", "compras_req ADD COLUMN orcamento TEXT"];
let pronto = false;
export async function garantir(db) {
  if (pronto) return;
  await db.batch(SQL.map(function (s) { return db.prepare(s); }));
  for (const a of ALTER) { try { await db.prepare("ALTER TABLE " + a).run(); } catch (e) {} }
  pronto = true;
}

// texto de busca sem acento e em minúsculas
export function norm(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }

export async function proximaReq(db, ano) {
  const r = await db.prepare("INSERT INTO compras_contador (ano, ultimo) VALUES (?1, 1) ON CONFLICT(ano) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo").bind(ano).first();
  return "REQ-" + ano + "-" + String(r.ultimo).padStart(4, "0");
}

export function evento(db, numero, por, de, para, obs) {
  return db.prepare("INSERT INTO compras_eventos (numero, em, por, de, para, obs) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(numero, agora(), por || null, de || null, para || null, obs || null);
}

export function dia(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null; }

// valida o que veio do celular; devolve { erro, msg } ou { req, itens, anexo }
export function lerRequisicao(d) {
  d = d || {};
  const solicitante = txt(d.solicitante, 80), obra = txt(d.obra, 60), destino = DESTINOS.includes(d.destino) ? d.destino : "Obra";
  const frota = txt(d.frota, 60), justificativa = txt(d.justificativa, 500);
  if (!solicitante) return { erro: "sem_solicitante", msg: "Selecione quem está pedindo." };
  if (destino === "Frota" && !frota) return { erro: "sem_frota", msg: "Informe o veículo." };
  const itens = (Array.isArray(d.itens) ? d.itens : []).slice(0, 40).map(function (x) {
    return { descricao: txt(x && x.descricao, 200), qtd: num(x && x.qtd), unidade: txt(x && x.unidade, 12), obs: txt(x && x.obs, 200) };
  }).filter(function (x) { return x.descricao; });
  if (!itens.length) return { erro: "sem_itens", msg: "Informe ao menos um item." };
  if (itens.some(function (x) { return !(x.qtd > 0); })) return { erro: "sem_qtd", msg: "Informe a quantidade de cada item." };
  if (!justificativa) return { erro: "sem_justificativa", msg: "Diga para que é o material." };
  const nec = dia(d.data_necessaria);
  if (!nec) return { erro: "sem_data", msg: "Informe para quando precisa." };
  let anexo = null;
  if (d.anexo && typeof d.anexo.dados === "string") {
    const m = /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.exec(d.anexo.dados);
    if (!m) return { erro: "anexo_invalido", msg: "O anexo precisa ser foto ou PDF." };
    if (d.anexo.dados.length > MAX_ANEXO) return { erro: "anexo_grande", msg: "Arquivo grande demais (máx. ~500 KB)." };
    anexo = { nome: txt(d.anexo.nome, 120) || "anexo", tipo: m[1], dados: d.anexo.dados };
  }
  return {
    req: { solicitante, empresa: ["HS", "MC"].includes(d.empresa) ? d.empresa : null, obra: destino === "Obra" ? obra : (obra || null), obra_desc: txt(d.obra_desc, 160),
      frota: frota, destino, prioridade: PRIORIDADES.includes(d.prioridade) ? d.prioridade : "Normal", data_necessaria: nec, justificativa, local_entrega: txt(d.local_entrega, 200), orcamento: txt(d.orcamento, 120) },
    itens, anexo
  };
}

export async function carregarReq(db, numero, comChave) {
  const r = await db.prepare("SELECT * FROM compras_req WHERE numero = ?1").bind(numero).first();
  if (!r) return null;
  const [it, ev, an] = await db.batch([
    db.prepare("SELECT item, descricao, qtd, unidade, codigo_fx, obs FROM compras_req_itens WHERE numero = ?1 ORDER BY item").bind(numero),
    db.prepare("SELECT em, por, de, para, obs FROM compras_eventos WHERE numero = ?1 ORDER BY id").bind(numero),
    db.prepare("SELECT id, nome, tipo, arquivo, (dados IS NOT NULL) AS tem FROM compras_anexos WHERE numero = ?1 ORDER BY id").bind(numero)
  ]);
  r.itens = it.results || []; r.eventos = ev.results || []; r.anexos = an.results || [];
  if (!comChave) delete r.chave;
  return r;
}

// o que o solicitante vê no celular (sem e-mail completo de quem comprou e sem chave)
export function publicoReq(r) {
  const curto = function (s) { return s ? String(s).split("@")[0] : null; };
  return { numero: r.numero, criado_em: r.criado_em, solicitante: r.solicitante, empresa: r.empresa, obra: r.obra, frota: r.frota, destino: r.destino, prioridade: r.prioridade,
    data_necessaria: r.data_necessaria, justificativa: r.justificativa, orcamento: r.orcamento || null, status: r.status, comprador: curto(r.comprador), previsao: r.previsao, pedido: r.pedido,
    obs_suprimentos: r.obs_suprimentos, motivo: r.motivo, atualizado_em: r.atualizado_em, itens: r.itens || [],
    eventos: (r.eventos || []).filter(function (e) { return e.para; }).map(function (e) { return { em: e.em, para: e.para }; }) };
}
