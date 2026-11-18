// Tudo em /api/gestao/* exige login do Cloudflare Access (conferido aqui, não só na borda).
import { resp } from "../../../lib/aut.js";
import { usuarioAccess } from "../../../lib/access.js";

export async function onRequest(ctx) {
  const quem = await usuarioAccess(ctx.request, ctx.env);
  if (!quem) return resp({ ok: false, erro: "nao_autorizado", msg: "Entre pelo login da HS (Cloudflare Access)." }, 401);
  ctx.data.quem = quem;
  return ctx.next();
}
