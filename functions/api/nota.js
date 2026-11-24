// GET /api/nota?u=<link do QR da NFC-e> — lê a nota pelo servidor NFC-e do escritório (nfce.hsgestao.app)
// sem expor o token no app: o cabeçalho X-HS-Token vem da variável secreta NFCE_TOKEN do projeto no Cloudflare.
import { resp, origemOk, ORIGENS } from "../../lib/aut.js";

const SERVIDOR = "https://nfce.hsgestao.app";

// GET do próprio site nem sempre manda Origin: aceita também Sec-Fetch-Site / Referer do próprio app.
function doApp(request) {
  if (origemOk(request)) return true;
  if (request.headers.get("Sec-Fetch-Site") === "same-origin") return true;
  const ref = request.headers.get("Referer") || "";
  return ORIGENS.some(o => ref === o || ref.startsWith(o + "/"));
}

export async function onRequestGet({ request, env }) {
  if (!doApp(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (!env.NFCE_TOKEN) return resp({ ok: false, erro: "token_nao_configurado" }, 500);
  const u = new URL(request.url).searchParams.get("u");
  if (!u) return resp({ ok: false, erro: "falta_parametro_u" }, 400);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch((env.NFCE_URL || SERVIDOR) + "/nota?u=" + encodeURIComponent(u), { headers: { "X-HS-Token": env.NFCE_TOKEN }, signal: ctrl.signal });
    return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return resp({ ok: false, erro: ctrl.signal.aborted ? "tempo_esgotado" : "servidor_fora" }, 504);
  } finally {
    clearTimeout(to);
  }
}
