// GET / — no domínio geral (hsgestao.app) abre a tela inicial com todos os apps (inicio/index.html).
// Em qualquer outro endereço (despesas.hsgestao.app, *.pages.dev) a raiz continua abrindo o app de despesas,
// então links antigos e apps já instalados no celular seguem funcionando.
export const HOSTS_HUB = ["hsgestao.app", "www.hsgestao.app"];

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (HOSTS_HUB.includes(url.hostname)) return ctx.env.ASSETS.fetch(new URL("/inicio/", url).href);
  return ctx.next();
}
