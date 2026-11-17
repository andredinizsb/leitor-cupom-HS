// GET /api/opcoes — listas de Tipo, Placa e Colaboradores lidas do formulário público (sem chave).
import { json, lerFormulario, lerOpcoes } from "../../lib/jotform.js";

export async function onRequestGet({ request }) {
  const origem = request.headers.get("Origin") || "";
  try {
    const op = lerOpcoes(await lerFormulario());
    if (!op.tipo.length) return json({ ok: false, erro: "opcoes_vazias" }, 502, origem);
    return json(Object.assign({ ok: true, via: "formulario" }, op), 200, origem);
  } catch (e) {
    return json({ ok: false, erro: "opcoes_falhou" }, 502, origem);
  }
}
