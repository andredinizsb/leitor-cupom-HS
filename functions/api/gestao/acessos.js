// /api/gestao/acessos — perfis da gestão e PINs dos apps de campo (tela /gestao/acessos/).
// GET              -> { eu:{email, perfis, admin, transicao}, perfis_disponiveis } (+ lista completa para o administrador)
// POST {acao: "perfil", email, nome, perfis[]} | {acao: "remover", email} | {acao: "config", gestao_restrito, campo_pin, campo_limite_hora}
//      {acao: "gerar_pin", colaborador} -> {pin} (aparece só nesta resposta) | {acao: "remover_pin", id}
// O _middleware só deixa POST aqui para quem tem o perfil admin.
import { resp, origemOk, semBanco, ERRO_BANCO, txt, agora } from "../../../lib/aut.js";
import { PERFIS, MODOS_PIN, garantir, lerConfig, contarAdmins, listaEmails, listaPerfis, novoPin } from "../../../lib/acessos.js";

export async function onRequestGet({ env, data }) {
  const a = data.acesso || { perfis: [] };
  const r = { ok: true, eu: { email: data.quem, perfis: a.perfis, admin: !!a.admin, transicao: !!a.transicao }, perfis_disponiveis: PERFIS };
  if (!a.admin || semBanco(env)) return resp(r);
  const db = env.DB;
  await garantir(db);
  r.config = await lerConfig(db);
  r.usuarios = (await db.prepare("SELECT email, nome, perfis, atualizado_em, atualizado_por FROM gestao_perfis ORDER BY email").all()).results || [];
  r.pins = (await db.prepare("SELECT id, colaborador, criado_em, criado_por, usado_em FROM campo_pins ORDER BY colaborador").all()).results || [];
  r.envios = (await db.prepare("SELECT em, app, colaborador, ip, situacao, ref FROM campo_envios ORDER BY id DESC LIMIT 200").all()).results || [];
  r.admins_fixos = listaEmails(env.GESTAO_ADMINS);
  return resp(r);
}

export async function onRequestPost({ request, env, data }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d; try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json" }, 400); }
  const db = env.DB, quem = data.quem, quando = agora(), fixos = listaEmails(env.GESTAO_ADMINS).length;
  await garantir(db);
  const cfg = await lerConfig(db);
  // nunca deixar a gestão sem administrador quando só quem está na lista pode alterar
  async function trancaria(restrito) { return restrito === "1" && !fixos && (await contarAdmins(db)) === 0; }
  const acao = d && d.acao;

  if (acao === "perfil" || acao === "remover") {
    const email = String(d.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resp({ ok: false, erro: "email", msg: "E-mail inválido." }, 400);
    const antes = await db.prepare("SELECT perfis FROM gestao_perfis WHERE email = ?1").bind(email).first();
    if (acao === "remover") await db.prepare("DELETE FROM gestao_perfis WHERE email = ?1").bind(email).run();
    else {
      const p = listaPerfis((Array.isArray(d.perfis) ? d.perfis : []).join(","));
      await db.prepare("INSERT INTO gestao_perfis (email, perfis, nome, atualizado_em, atualizado_por) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(email) DO UPDATE SET perfis = ?2, nome = ?3, atualizado_em = ?4, atualizado_por = ?5")
        .bind(email, p.join(","), txt(d.nome, 80), quando, quem).run();
    }
    if (await trancaria(cfg.gestao_restrito)) {   // desfaz
      if (antes) await db.prepare("INSERT INTO gestao_perfis (email, perfis, atualizado_em, atualizado_por) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(email) DO UPDATE SET perfis = ?2").bind(email, antes.perfis, quando, quem).run();
      else await db.prepare("DELETE FROM gestao_perfis WHERE email = ?1").bind(email).run();
      return resp({ ok: false, erro: "ultimo_admin", msg: "Não dá: a gestão ficaria sem nenhum administrador." }, 409);
    }
    return resp({ ok: true, msg: acao === "remover" ? "Removido da lista." : "Perfis salvos." });
  }

  if (acao === "config") {
    const novo = {};
    if (d.gestao_restrito != null) novo.gestao_restrito = d.gestao_restrito === true || String(d.gestao_restrito) === "1" ? "1" : "0";
    if (d.campo_pin != null) { if (!MODOS_PIN.includes(d.campo_pin)) return resp({ ok: false, erro: "campo_pin" }, 400); novo.campo_pin = d.campo_pin; }
    if (d.campo_limite_hora != null) { const n = parseInt(d.campo_limite_hora, 10); if (!(n >= 5 && n <= 10000)) return resp({ ok: false, erro: "limite", msg: "Limite por hora: de 5 a 10000." }, 400); novo.campo_limite_hora = String(n); }
    if (novo.gestao_restrito === "1" && (await trancaria("1"))) return resp({ ok: false, erro: "sem_admin", msg: "Antes de ligar, coloque você mesmo na lista com o perfil Administrador." }, 409);
    await db.batch(Object.keys(novo).map(function (k) {
      return db.prepare("INSERT INTO gestao_config (chave, valor, atualizado_em, atualizado_por) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(chave) DO UPDATE SET valor = ?2, atualizado_em = ?3, atualizado_por = ?4").bind(k, novo[k], quando, quem);
    }));
    return resp({ ok: true, config: await lerConfig(db), msg: "Parâmetros salvos." });
  }

  if (acao === "gerar_pin") {
    const c = txt(d.colaborador, 80);
    if (!c) return resp({ ok: false, erro: "colaborador", msg: "Escolha o colaborador." }, 400);
    const pin = await novoPin(db, c, quem);
    return resp({ ok: true, colaborador: c, pin: pin, msg: "PIN de " + c + ": " + pin + ". Anote e passe ao colaborador (ele não aparece de novo)." });
  }
  if (acao === "remover_pin") {
    await db.prepare("DELETE FROM campo_pins WHERE id = ?1").bind(Number(d.id) || 0).run();
    return resp({ ok: true, msg: "PIN removido." });
  }
  return resp({ ok: false, erro: "acao" }, 400);
}
