// GET / — o endereço único do HS Gestão é hsgestao.app: a raiz abre a tela inicial com todos os apps (inicio/index.html).
// O Despesas agora fica em hsgestao.app/despesas/. Quem abrir o endereço antigo (despesas.hsgestao.app, links e apps
// instalados antes) é levado para lá. Os demais caminhos do endereço antigo são redirecionados por uma Regra de
// Redirecionamento da Cloudflare (menos /api/, que continua respondendo nos dois endereços para a planilha e apps antigos).
export const HOST_ANTIGO = "despesas.hsgestao.app";

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (url.hostname === HOST_ANTIGO) return Response.redirect("https://hsgestao.app/despesas/" + url.search, 302);
  return ctx.env.ASSETS.fetch(new URL("/inicio/", url).href);
}
