// Envio pelo formulário PÚBLICO do Jotform (o mesmo que qualquer pessoa preenche no site).
// Não usa a chave da API: nenhum segredo fica no GitHub nem no app.
export const FORM_ID = "263144226552049";
export const FORM_URL = "https://form.jotform.com/" + FORM_ID;
export const SUBMIT_URL = "https://submit.jotform.com/submit/" + FORM_ID;

// qid -> nome do campo (copiado do formulário em 17/11/2026). Se o formulário mudar,
// a rota relê os nomes direto da página pública (lerNomes).
const NOMES_PADRAO = {
  "3": "dataDa", "8": "nDa", "10": "descricaoObra", "11": "colaboradoresEnvolvidos",
  "12": "tipoDe", "13": "frota", "14": "litros", "15": "descricaoDo", "16": "valorTotal",
  "18": "fotoDa", "19": "observacao", "20": "quantidade", "21": "nomeDo", "24": "cnpj24", "26": "notaFiscal"
};

export const ORIGENS_OK = ["https://despesas.hsgestao.app", "http://localhost:8080", "http://127.0.0.1:8080"];

export function json(obj, status, origem) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": ORIGENS_OK.includes(origem) ? origem : ORIGENS_OK[0],
      "Vary": "Origin"
    }
  });
}

export async function lerFormulario() {
  const r = await fetch(FORM_URL, { headers: { "User-Agent": "Mozilla/5.0 HS-Despesas" } });
  if (!r.ok) throw new Error("form_http_" + r.status);
  return await r.text();
}

function decodeHtml(s) {
  return String(s).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

export function lerNomes(html) {
  const map = Object.assign({}, NOMES_PADRAO);
  const re = /name="q(\d+)_([A-Za-z0-9]+)/g; let m;
  while ((m = re.exec(html))) map[m[1]] = m[2];
  return map;
}

// Opções de Tipo (12), Placa (13) e Colaboradores (11) tiradas da página pública.
export function lerOpcoes(html) {
  function select(qid) {
    const m = new RegExp('<select[^>]*id="input_' + qid + '"[^>]*>([\\s\\S]*?)</select>').exec(html);
    if (!m) return [];
    const out = []; const re = /<option value="([^"]*)"/g; let o;
    while ((o = re.exec(m[1]))) { const v = decodeHtml(o[1]); if (v !== "") out.push(v); }
    return out;
  }
  const colab = []; const re = /id="input_11_\d+"[^>]*value="([^"]*)"|value="([^"]*)"[^>]*id="input_11_\d+"/g; let c;
  while ((c = re.exec(html))) colab.push(decodeHtml(c[1] != null ? c[1] : c[2]));
  return { tipo: select("12"), placa: select("13"), colaboradores: colab };
}

// fields no mesmo formato que o app manda ao servidor: {"3_year":"2026","8":"4231","11":[...],...}
export async function enviarFormulario(fields, foto, nomes) {
  const fd = new FormData();
  fd.append("formID", FORM_ID);
  let any = false;
  for (const k of Object.keys(fields || {})) {
    const v = fields[k];
    let qid = k, sub = "";
    const us = k.indexOf("_");
    if (us >= 0) { qid = k.slice(0, us); sub = k.slice(us + 1); }
    const name = nomes[qid];
    if (!name) continue;
    const base = "q" + qid + "_" + name;
    if (Array.isArray(v)) {
      v.forEach(it => { if (it != null && it !== "") { fd.append(base + "[]", String(it)); any = true; } });
    } else if (v != null && v !== "") {
      fd.append(sub ? base + "[" + sub + "]" : base, String(v));
      any = true;
    }
  }
  if (!any) throw new Error("sem_campos");
  if (foto && typeof foto === "string") {
    const m = /^data:([^;]+);base64,(.+)$/.exec(foto);
    if (m) {
      const bin = atob(m[2]); const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      fd.append("q18_" + (nomes["18"] || "fotoDa"), new Blob([buf], { type: m[1] }), "cupom.jpg");
    }
  }
  const r = await fetch(SUBMIT_URL, { method: "POST", body: fd, redirect: "manual" });
  const corpo = r.status < 300 ? await r.text().catch(() => "") : "";
  // Jotform responde 200 (página de obrigado) ou 3xx (redireciona p/ obrigado). Erro de validação volta 200
  // com a página de erro — checamos o texto para não dizer "enviado" sem ter gravado.
  if (r.status >= 400) throw new Error("jotform_http_" + r.status);
  if (/form-error-message|There was a problem|houve um problema|Please wait while we redirect|captcha/i.test(corpo) && !/thank|obrigad|submission received|thankyou/i.test(corpo)) {
    throw new Error("jotform_recusou");
  }
  return { status: r.status, destino: r.headers.get("location") || null };
}
