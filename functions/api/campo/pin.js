// /api/campo/pin — PIN do colaborador nos apps de campo (sem login). Ver lib/acessos.js.
// GET          -> { modo }  ("desligado" | "aviso" | "obrigatorio")
// POST {pin}   -> { ok, colaborador }  confere o PIN digitado no aparelho (até 10 erros por hora na mesma rede)
import { resp, origemOk, semBanco, ERRO_BANCO } from "../../../lib/aut.js";
import { lerConfig, acharPin, errosPin, registrar, ipDe, pinValido } from "../../../lib/acessos.js";

export async function onRequestGet({ env }) {
  if (semBanco(env)) return resp({ ok: true, modo: "desligado" });
  try { const c = await lerConfig(env.DB); return resp({ ok: true, modo: c.campo_pin }); }
  catch (e) { return resp({ ok: true, modo: "desligado" }); }
}

export async function onRequestPost({ request, env }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d; try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const db = env.DB, ip = ipDe(request), pin = String((d && d.pin) || "").trim();
  await lerConfig(db);
  if ((await errosPin(db, ip)) >= 10) return resp({ ok: false, erro: "limite_pin", msg: "Muitas tentativas erradas. Espere uma hora ou peça ajuda ao escritório." }, 429);
  const p = pinValido(pin) ? await acharPin(db, pin) : null;
  if (!p) { await registrar(db, "pin", null, ip, "pin_invalido"); return resp({ ok: false, erro: "pin", msg: "PIN não encontrado. Confira os números ou peça o seu ao escritório." }, 404); }
  return resp({ ok: true, colaborador: p.colaborador });
}
