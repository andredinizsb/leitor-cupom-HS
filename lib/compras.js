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
  "CREATE TABLE IF NOT EXISTS compras_contador (ano INTEGER PRIMARY KEY, ultimo INTEGER NOT NULL)"
];
let pronto = false;
export async function garantir(db) {
  if (pronto) return;
  await db.batch(SQL.map(function (s) { return db.prepare(s); }));
  pronto = true;
}

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
  if (destino === "Obra" && !obra) return { erro: "sem_obra", msg: "Informe a obra." };
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
      frota: frota, destino, prioridade: PRIORIDADES.includes(d.prioridade) ? d.prioridade : "Normal", data_necessaria: nec, justificativa, local_entrega: txt(d.local_entrega, 200) },
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
    data_necessaria: r.data_necessaria, justificativa: r.justificativa, status: r.status, comprador: curto(r.comprador), previsao: r.previsao, pedido: r.pedido,
    obs_suprimentos: r.obs_suprimentos, motivo: r.motivo, atualizado_em: r.atualizado_em, itens: r.itens || [],
    eventos: (r.eventos || []).filter(function (e) { return e.para; }).map(function (e) { return { em: e.em, para: e.para }; }) };
}
