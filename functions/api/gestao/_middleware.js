// Tudo em /api/gestao/* exige login do Cloudflare Access (conferido aqui, não só na borda).
// Depois do login, as ALTERAÇÕES (POST) pedem o perfil da área (lib/acessos.js; lista na tela Gestão > Acessos).
import { resp } from "../../../lib/aut.js";
import { usuarioAccess } from "../../../lib/access.js";
import { perfisDe, perfilDaRota, semPerfil } from "../../../lib/acessos.js";

export async function onRequest(ctx) {
  const quem = await usuarioAccess(ctx.request, ctx.env);
  if (!quem) return resp({ ok: false, erro: "nao_autorizado", msg: "Entre pelo login da HS (Cloudflare Access)." }, 401);
  ctx.data.quem = quem;
  const acesso = await perfisDe(ctx.env, quem);
  ctx.data.acesso = acesso; ctx.data.perfis = acesso.perfis;
  const m = ctx.request.method;
  if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
    const precisa = perfilDaRota(new URL(ctx.request.url).pathname);
    if (precisa && !acesso.perfis.includes(precisa)) return semPerfil(quem, precisa);
  }
  return ctx.next();
}
