// HS Gestão · Autorização Digital — funções comuns às rotas /api/aut, /api/gestao e /v
// Banco: Cloudflare D1, ligado ao projeto Pages com o nome DB (Configurações > Vínculos > D1).

export const ORIGENS = [
  "https://despesas.hsgestao.app",
  "http://localhost:8788", "http://127.0.0.1:8788",
  "http://localhost:8080", "http://127.0.0.1:8080"
];

export const TIPOS = ["Abastecimento", "Material elétrico", "Material de consumo", "Ferramenta", "Peça / manutenção", "Outros"];
export const COMBUSTIVEIS = ["Diesel S-10", "Diesel S-500", "Gasolina", "Etanol", "Arla 32"];
export const STATUS_ATIVOS = ["Emitida", "Parcialmente atendida"];

export function resp(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, extra || {})
  });
}

// POST do próprio site: o navegador sempre manda Origin. Sem Origin conhecido = recusa.
export function origemOk(request) {
  const o = request.headers.get("Origin");
  return !!o && ORIGENS.includes(o);
}

export function semBanco(env) {
  return !env || !env.DB;
}
export const ERRO_BANCO = { ok: false, erro: "banco_nao_configurado", msg: "O banco D1 (DB) ainda não foi ligado a este site." };

export function agora() { return new Date().toISOString(); }

export function aleatorio(bytes) {
  const b = new Uint8Array(bytes || 18);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function txt(v, max) {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001f]/g, " ").trim();
  if (!s) return null;
  return s.slice(0, max || 200);
}
export function num(v) {
  if (v == null || v === "") return null;
  let s = String(v).trim();
  if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : null;
}
export function soDigitos(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }

// Emitida e vencida aparece como "Expirada" (o status gravado continua Emitida — a validade decide)
export function statusVisivel(a, quando) {
  const t = quando || agora();
  if (STATUS_ATIVOS.includes(a.status) && a.validade && a.validade < t) return "Expirada";
  return a.status;
}

export async function proximoNumero(db, ano) {
  const r = await db.prepare(
    "INSERT INTO contadores (ano, ultimo) VALUES (?1, 1) ON CONFLICT(ano) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo"
  ).bind(ano).first();
  return "AUT-" + ano + "-" + String(r.ultimo).padStart(6, "0");
}

export async function carregar(db, numero) {
  const a = await db.prepare("SELECT * FROM autorizacoes WHERE numero = ?1").bind(numero).first();
  if (!a) return null;
  const itens = await db.prepare("SELECT item, descricao, qtd, unidade FROM autorizacao_itens WHERE numero = ?1 ORDER BY item").bind(numero).all();
  const at = await db.prepare("SELECT id, registrado_em, registrado_por, data_cupom, cnpj, estabelecimento, chave_nfce, numero_nf, valor_total, itens_json, parcial, observacao FROM atendimentos WHERE numero = ?1 ORDER BY id").bind(numero).all();
  a.itens = itens.results || [];
  a.atendimentos = (at.results || []).map(function (x) {
    let it = []; try { it = JSON.parse(x.itens_json || "[]"); } catch (e) { it = []; }
    x.itens = it; delete x.itens_json; return x;
  });
  a.status_visivel = statusVisivel(a);
  return a;
}

// visão do colaborador / pública: sem chave privada e sem dados internos
export function publico(a) {
  return {
    numero: a.numero, tipo: a.tipo, colaborador: a.colaborador, empresa: a.empresa, obra: a.obra,
    estabelecimento: a.estabelecimento, veiculo: a.veiculo, km: a.km, combustivel: a.combustivel, litros_max: a.litros_max,
    justificativa: a.justificativa, status: a.status_visivel || statusVisivel(a), solicitado_em: a.solicitado_em,
    validade: a.validade, decidido_em: a.decidido_em, motivo: a.motivo, itens: a.itens || [],
    autorizado_por: a.decidido_por ? String(a.decidido_por).split("@")[0] : null
  };
}

export function historico(db, numero, quem, de, para, obs) {
  return db.prepare("INSERT INTO historico (numero, quando, quem, de, para, obs) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(numero, agora(), quem || null, de || null, para || null, obs || null);
}

// Registra o atendimento (cupom) de uma autorização ativa. Retorna { ok, erro?, status? }
export async function registrarAtendimento(db, a, d, quem) {
  if (!STATUS_ATIVOS.includes(a.status)) return { ok: false, erro: "status_" + a.status, msg: "Esta autorização está " + a.status + "." };
  const dataCupom = /^\d{4}-\d{2}-\d{2}$/.test(String(d.data_cupom || "")) ? String(d.data_cupom) : null;
  // vencida só aceita cupom emitido até o dia da validade
  if (a.validade && a.validade < agora()) {
    if (!dataCupom || dataCupom > a.validade.slice(0, 10)) return { ok: false, erro: "expirada", msg: "Autorização vencida em " + a.validade.slice(0, 10) + "." };
  }
  const chave = soDigitos(d.chave_nfce);
  if (chave && chave.length !== 44) return { ok: false, erro: "chave_invalida", msg: "A chave do cupom deve ter 44 dígitos." };
  const valor = num(d.valor_total);
  if (valor == null || valor <= 0) return { ok: false, erro: "valor_invalido", msg: "Informe o valor total do cupom." };
  if (chave) {
    const usado = await db.prepare("SELECT numero FROM atendimentos WHERE chave_nfce = ?1").bind(chave).first();
    if (usado) return { ok: false, erro: "cupom_ja_usado", msg: "Este cupom já foi vinculado à " + usado.numero + "." };
  }
  const itens = Array.isArray(d.itens) ? d.itens.slice(0, 80).map(function (x) {
    return { descricao: txt(x && x.descricao, 160), qtd: num(x && x.qtd), unidade: txt(x && x.unidade, 10), valor: num(x && x.valor) };
  }).filter(function (x) { return x.descricao; }) : [];
  const parcial = d.parcial ? 1 : 0;
  const novo = parcial ? "Parcialmente atendida" : "Atendida";
  const cnpj = soDigitos(d.cnpj) || (chave ? chave.slice(6, 20) : "");
  const nf = txt(d.numero_nf, 20) || (chave ? String(parseInt(chave.slice(25, 34), 10)) : null);
  await db.batch([
    db.prepare("INSERT INTO atendimentos (numero, registrado_em, registrado_por, data_cupom, cnpj, estabelecimento, chave_nfce, numero_nf, valor_total, itens_json, parcial, observacao) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)")
      .bind(a.numero, agora(), quem || null, dataCupom, cnpj || null, txt(d.estabelecimento, 120), chave || null, nf, valor, JSON.stringify(itens), parcial, txt(d.observacao, 300)),
    db.prepare("UPDATE autorizacoes SET status = ?2 WHERE numero = ?1").bind(a.numero, novo),
    historico(db, a.numero, quem, a.status, novo, "cupom " + (nf || "") + " R$ " + valor.toFixed(2))
  ]);
  return { ok: true, status: novo };
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
