// Login da área de gestão pelo Cloudflare Access (Zero Trust).
// O Access fica na frente de /gestao e /api/gestao e manda o token (JWT) no header Cf-Access-Jwt-Assertion.
// Aqui o token é CONFERIDO (assinatura, validade, AUD): sem isso, qualquer um que achasse o endereço *.pages.dev entraria.
// Variáveis do projeto Pages (Configurações > Variáveis):
//   ACCESS_TEAM_DOMAIN = <seu-time>.cloudflareaccess.com
//   ACCESS_AUD         = "Application Audience (AUD) Tag" do aplicativo no Access
//   APROVADORES        = (opcional) e-mails que podem aprovar, separados por ; — em branco = quem o Access deixar entrar

let cache = { url: "", t: 0, keys: null };

function b64urlBytes(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlJson(s) { return JSON.parse(new TextDecoder().decode(b64urlBytes(s))); }

async function chaves(env) {
  if (env.ACCESS_JWKS) return JSON.parse(env.ACCESS_JWKS).keys || [];   // só para testes locais
  const url = "https://" + env.ACCESS_TEAM_DOMAIN + "/cdn-cgi/access/certs";
  if (cache.keys && cache.url === url && Date.now() - cache.t < 3600 * 1000) return cache.keys;
  const r = await fetch(url);
  if (!r.ok) throw new Error("certs_http_" + r.status);
  const j = await r.json();
  cache = { url: url, t: Date.now(), keys: j.keys || [] };
  return cache.keys;
}

function tokenDaRequisicao(request) {
  const h = request.headers.get("Cf-Access-Jwt-Assertion");
  if (h) return h;
  const ck = request.headers.get("Cookie") || "";
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(ck);
  return m ? m[1] : null;
}

// Devolve o e-mail de quem está logado, ou null (recusa em qualquer dúvida).
export async function usuarioAccess(request, env) {
  try {
    if (!env || !env.ACCESS_AUD || (!env.ACCESS_TEAM_DOMAIN && !env.ACCESS_JWKS)) return null;
    const jwt = tokenDaRequisicao(request);
    if (!jwt) return null;
    const partes = jwt.split(".");
    if (partes.length !== 3) return null;
    const cab = b64urlJson(partes[0]), dados = b64urlJson(partes[1]);
    if (cab.alg !== "RS256") return null;
    const jwk = (await chaves(env)).find(function (k) { return k.kid === cab.kid; });
    if (!jwk) return null;
    const chave = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, b64urlBytes(partes[2]), new TextEncoder().encode(partes[0] + "." + partes[1]));
    if (!ok) return null;
    const t = Date.now() / 1000;
    if (!dados.exp || dados.exp < t) return null;
    if (dados.nbf && dados.nbf > t + 60) return null;
    const aud = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (env.ACCESS_TEAM_DOMAIN && dados.iss && dados.iss !== "https://" + env.ACCESS_TEAM_DOMAIN) return null;
    const email = String(dados.email || "").toLowerCase();
    if (!email) return null;
    if (env.APROVADORES) {
      const lista = String(env.APROVADORES).toLowerCase().split(/[;,\s]+/).filter(Boolean);
      if (lista.length && !lista.includes(email)) return null;
    }
    return email;
  } catch (e) {
    return null;
  }
}
