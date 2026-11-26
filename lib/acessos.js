// HS Gestão · acessos
// 1) Perfis da gestão pelo e-mail do Cloudflare Access (tela /gestao/acessos/). Só as ALTERAÇÕES (POST) pedem perfil; consultar continua livre.
//    Transição: e-mail fora da lista mantém o acesso de hoje enquanto "Somente quem está na lista" estiver desligado.
//    Variável opcional GESTAO_ADMINS (e-mails separados por ;): sempre administradores, para nunca ficar trancado do lado de fora.
// 2) Apps de campo (sem login): PIN por colaborador no cabeçalho X-HS-Pin, limite de envios por hora e registro de quem enviou.
//    Parâmetro campo_pin: "desligado" (só registra) -> "aviso" (o app pede o PIN, mas aceita sem) -> "obrigatorio".
// As tabelas são criadas aqui mesmo (garantir), sem SQL manual no D1.
import { resp, agora } from "./aut.js";

export const PERFIS = {
  admin: "Administrador (tudo, inclusive esta tela)",
  despesas: "Despesas: editar lançamentos",
  frota: "Frota: manutenções, pendências e documentos",
  compras: "Compras: requisições, cotações, pedidos e autorizações",
  obras: "RDO e checklist: aprovar, assinar e editar"
};
const TODOS = Object.keys(PERFIS);
export const CONFIG_PADRAO = { gestao_restrito: "0", campo_pin: "desligado", campo_limite_hora: "120" };
export const MODOS_PIN = ["desligado", "aviso", "obrigatorio"];
const MAX_ERROS_PIN = 10;   // tentativas de PIN erradas por hora no mesmo aparelho/rede

const SQL = [
  "CREATE TABLE IF NOT EXISTS gestao_perfis (email TEXT PRIMARY KEY, perfis TEXT NOT NULL DEFAULT '', nome TEXT, atualizado_em TEXT, atualizado_por TEXT)",
  "CREATE TABLE IF NOT EXISTS gestao_config (chave TEXT PRIMARY KEY, valor TEXT, atualizado_em TEXT, atualizado_por TEXT)",
  "CREATE TABLE IF NOT EXISTS campo_pins (id INTEGER PRIMARY KEY AUTOINCREMENT, colaborador TEXT NOT NULL, sal TEXT NOT NULL, hash TEXT NOT NULL, criado_em TEXT, criado_por TEXT, usado_em TEXT)",
  "CREATE TABLE IF NOT EXISTS campo_envios (id INTEGER PRIMARY KEY AUTOINCREMENT, em TEXT NOT NULL, app TEXT, colaborador TEXT, ip TEXT, situacao TEXT, ref TEXT)",
  "CREATE INDEX IF NOT EXISTS ix_campo_envios_em ON campo_envios(em)"
];
let pronto = null;
export async function garantir(db) {
  if (pronto === db) return;
  await db.batch(SQL.map(function (s) { return db.prepare(s); }));
  pronto = db;
}

export function listaEmails(s) { return String(s || "").toLowerCase().split(/[;,\s]+/).filter(function (x) { return /@/.test(x); }); }
export function listaPerfis(s) { return String(s || "").split(/[;,\s]+/).filter(function (x) { return TODOS.includes(x); }); }

export async function lerConfig(db) {
  await garantir(db);
  const c = Object.assign({}, CONFIG_PADRAO);
  ((await db.prepare("SELECT chave, valor FROM gestao_config").all()).results || []).forEach(function (r) { if (r.valor != null) c[r.chave] = String(r.valor); });
  return c;
}
export async function contarAdmins(db) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM gestao_perfis WHERE ',' || perfis || ',' LIKE '%,admin,%'").first();
  return (r && r.n) || 0;
}

// { perfis:[...], admin, transicao } de quem está logado
export async function perfisDe(env, email) {
  if (listaEmails(env.GESTAO_ADMINS).includes(email)) return { perfis: TODOS.slice(), admin: true, fonte: "GESTAO_ADMINS" };
  if (!env.DB) return { perfis: TODOS.slice(), admin: true, transicao: true };
  try {
    await garantir(env.DB);
    const r = await env.DB.prepare("SELECT (SELECT perfis FROM gestao_perfis WHERE email = ?1) AS meus, (SELECT COUNT(*) FROM gestao_perfis WHERE ',' || perfis || ',' LIKE '%,admin,%') AS admins, (SELECT valor FROM gestao_config WHERE chave = 'gestao_restrito') AS restrito").bind(email).first();
    if (r && r.meus != null) {
      const p = listaPerfis(r.meus);
      return p.includes("admin") ? { perfis: TODOS.slice(), admin: true } : { perfis: p, admin: false };
    }
    if (String(r && r.restrito) === "1") return { perfis: [], admin: false };
    // fora da lista, na transição: continua com tudo; vira administrador só enquanto ninguém for administrador
    const p = TODOS.filter(function (x) { return x !== "admin" || !(r && r.admins); });
    return { perfis: p, admin: p.includes("admin"), transicao: true };
  } catch (e) {
    return { perfis: TODOS.filter(function (x) { return x !== "admin"; }), admin: false, transicao: true, erro: true };   // banco com problema não tranca ninguém
  }
}

// perfil exigido para ALTERAR em cada rota da gestão (GET é livre para quem passou pelo Access)
const ROTAS = [
  [/^\/api\/gestao\/acessos/, "admin"],
  [/^\/api\/gestao\/despesas/, "despesas"],
  [/^\/api\/gestao\/frota/, "frota"],
  [/^\/api\/gestao\/(compras|decidir|autorizacoes|canhoto)/, "compras"],
  [/^\/api\/gestao\/(rdo|checklist)/, "obras"]
];
export function perfilDaRota(caminho) { const r = ROTAS.find(function (x) { return x[0].test(caminho); }); return r ? r[1] : null; }
export function semPerfil(quem, perfil) {
  return resp({ ok: false, erro: "sem_perfil", perfil: perfil,
    msg: "Seu login (" + quem + ") não tem o perfil “" + PERFIS[perfil].split(/[:(]/)[0].trim() + "” para fazer esta alteração. Peça a liberação ao administrador (Gestão > Acessos)." }, 403);
}

// ---- apps de campo ----
export function ipDe(request) { return request.headers.get("CF-Connecting-IP") || String(request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() || "?"; }
async function sha(s) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
}
export function pinValido(p) { return /^\d{4,8}$/.test(String(p || "")); }
export async function acharPin(db, pin) {
  if (!pinValido(pin)) return null;
  const rs = (await db.prepare("SELECT id, colaborador, sal, hash FROM campo_pins").all()).results || [];
  for (const r of rs) if ((await sha(r.sal + ":" + pin)) === r.hash) return r;
  return null;
}
export async function novoPin(db, colaborador, quem) {
  let pin = "";
  for (let i = 0; i < 50; i++) {
    const n = new Uint32Array(1); crypto.getRandomValues(n);
    pin = String(n[0] % 10000).padStart(4, "0");
    if (!/^(\d)\1{3}$/.test(pin) && pin !== "1234" && !(await acharPin(db, pin))) break;
  }
  const s = new Uint8Array(8); crypto.getRandomValues(s);
  const sal = Array.from(s, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  await db.batch([
    db.prepare("DELETE FROM campo_pins WHERE colaborador = ?1").bind(colaborador),
    db.prepare("INSERT INTO campo_pins (colaborador, sal, hash, criado_em, criado_por) VALUES (?1, ?2, ?3, ?4, ?5)").bind(colaborador, sal, await sha(sal + ":" + pin), agora(), quem || null)
  ]);
  return pin;
}
function umaHora() { return new Date(Date.now() - 3600 * 1000).toISOString(); }
export async function errosPin(db, ip) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM campo_envios WHERE em > ?1 AND ip = ?2 AND situacao IN ('pin_invalido', 'bloqueado_pin')").bind(umaHora(), ip).first();
  return (r && r.n) || 0;
}
export async function registrar(db, app, colaborador, ip, situacao, ref) {
  const r = await db.prepare("INSERT INTO campo_envios (em, app, colaborador, ip, situacao, ref) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id").bind(agora(), app, colaborador || null, ip, situacao, ref || null).first();
  return r && r.id;
}

// Chamar no começo de cada envio do campo. Devolve { bloqueio: Response } ou { colaborador, feito(ref) }.
export async function conferirCampo(request, env, app) {
  const livre = { colaborador: null, feito: async function () {} };
  if (!env || !env.DB) return livre;
  try {
    const db = env.DB, cfg = await lerConfig(db), ip = ipDe(request), pin = String(request.headers.get("X-HS-Pin") || "").trim();
    const modo = MODOS_PIN.includes(cfg.campo_pin) ? cfg.campo_pin : "desligado", lim = Math.max(5, parseInt(cfg.campo_limite_hora, 10) || 120);
    // tentativa de adivinhar PIN: só trava quando o PIN é obrigatório (nos outros modos, PIN errado vale como "sem PIN" e não atrapalha a obra)
    if (modo === "obrigatorio" && pin && (await errosPin(db, ip)) >= MAX_ERROS_PIN) {
      await registrar(db, app, null, ip, "bloqueado_limite");
      return { bloqueio: resp({ ok: false, erro: "limite_pin", msg: "Muitas tentativas de PIN erradas. Espere uma hora ou peça ajuda ao escritório." }, 429) };
    }
    const p = pin ? await acharPin(db, pin) : null;
    // limite: com PIN conta por colaborador; sem PIN conta pela rede/aparelho (várias pessoas podem sair pelo mesmo IP do celular)
    const c = p ? await db.prepare("SELECT COUNT(*) AS n FROM campo_envios WHERE em > ?1 AND colaborador = ?2 AND situacao NOT LIKE 'bloq%'").bind(umaHora(), p.colaborador).first()
      : await db.prepare("SELECT COUNT(*) AS n FROM campo_envios WHERE em > ?1 AND ip = ?2 AND colaborador IS NULL AND situacao NOT LIKE 'bloq%'").bind(umaHora(), ip).first();
    if (((c && c.n) || 0) >= lim) {
      await registrar(db, app, p ? p.colaborador : null, ip, "bloqueado_limite");
      return { bloqueio: resp({ ok: false, erro: "limite", msg: "Muitos envios em pouco tempo. Espere alguns minutos e tente de novo (se precisar, avise o escritório)." }, 429) };
    }
    if (modo === "obrigatorio" && !p) {
      await registrar(db, app, null, ip, "bloqueado_pin");
      return { bloqueio: resp({ ok: false, erro: "pin", msg: pin ? "PIN não confere. Confira o PIN ou peça um novo ao escritório." : "Este app agora pede o PIN do colaborador. Peça o seu PIN ao escritório e digite no botão “PIN” do app." }, 401) };
    }
    const id = await registrar(db, app, p ? p.colaborador : null, ip, p ? "ok" : (pin ? "pin_invalido" : "sem_pin"));
    if (p) await db.prepare("UPDATE campo_pins SET usado_em = ?2 WHERE id = ?1").bind(p.id, agora()).run();
    return { colaborador: p ? p.colaborador : null, modo: modo,
      feito: async function (ref) { try { if (id && ref) await db.prepare("UPDATE campo_envios SET ref = ?2 WHERE id = ?1").bind(id, String(ref).slice(0, 60)).run(); } catch (e) {} } };
  } catch (e) {
    return livre;   // problema no registro não impede o envio da obra
  }
}
