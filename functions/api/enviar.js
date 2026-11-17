// POST /api/enviar  — caminho de reserva: grava a despesa no Jotform mesmo com o servidor NFC-e fora do ar.
import { json, ORIGENS_OK, lerFormulario, lerNomes, enviarFormulario } from "../../lib/jotform.js";

export async function onRequestPost({ request }) {
  const origem = request.headers.get("Origin") || "";
  if (origem && !ORIGENS_OK.includes(origem)) return json({ ok: false, erro: "origem_nao_permitida" }, 403, origem);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, erro: "json_invalido" }, 400, origem); }
  const fields = body && body.fields ? body.fields : body;
  let nomes;
  try { nomes = lerNomes(await lerFormulario()); } catch (e) { nomes = lerNomes(""); }
  try {
    const resultado = await enviarFormulario(fields, body && body.foto, nomes);
    return json({ ok: true, via: "formulario", resultado }, 200, origem);
  } catch (e) {
    return json({ ok: false, erro: (e && e.message) || "erro_envio" }, 502, origem);
  }
}

export function onRequestOptions({ request }) {
  return json({}, 200, request.headers.get("Origin") || "");
}
