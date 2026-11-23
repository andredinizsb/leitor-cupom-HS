// GET /v/<token> — página PÚBLICA (o estabelecimento escaneia o QR) que só mostra se a autorização vale.
// Somente leitura. Não mostra valores, chave do colaborador nem dados internos.
import { semBanco, carregar, publico, esc } from "../../lib/aut.js";

const COR = { "Emitida": ["#117E52", "VÁLIDA"], "Parcialmente atendida": ["#99620F", "VÁLIDA (PARCIALMENTE ATENDIDA)"], "Atendida": ["#667085", "JÁ UTILIZADA"],
  "Expirada": ["#AD1F27", "VENCIDA"], "Cancelada": ["#AD1F27", "CANCELADA"], "Recusada": ["#AD1F27", "RECUSADA"], "Pendente": ["#99620F", "AGUARDANDO APROVAÇÃO"] };

function quando(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch (e) { return iso; }
}

function pagina(titulo, corpo) {
  return new Response('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + esc(titulo) + '</title><style>' +
    ':root{--bg:#F5F7FA;--card:#fff;--tx:#252B36;--mut:#667085;--bd:#E4E7EC}@media (prefers-color-scheme:dark){:root{--bg:#0E1217;--card:#161B22;--tx:#F2F4F7;--mut:#A3ACB9;--bd:#2A313C}}' +
    'body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{max-width:520px;margin:0 auto;padding:16px}' +
    '.marca{display:flex;align-items:center;gap:10px;margin:4px 0 16px;font-weight:600}.marca img{width:32px;height:32px;border-radius:8px}.marca small{display:block;font-weight:400;font-size:13px;color:var(--mut)}.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(16,24,40,.08)}' +
    '.selo{color:#fff;border-radius:10px;padding:14px;text-align:center;font-weight:800;font-size:22px;letter-spacing:.5px}.n{font-size:20px;font-weight:700;margin:4px 0 2px}' +
    'dl{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0}dt{color:var(--mut)}dd{margin:0;font-weight:600;word-break:break-word}.mut{color:var(--mut);font-size:14px}ul{margin:6px 0 0;padding-left:20px}' +
    '</style></head><body><main><div class="marca"><img src="/icons/autorizacao.svg" alt=""><span>HS Eletricidade<small>Conferência de autorização de compra</small></span></div>' + corpo + '</main></body></html>',
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export async function onRequestGet({ params, env }) {
  const token = String(params.token || "");
  if (semBanco(env) || token.length < 16) return pagina("Autorização", '<div class="card"><div class="selo" style="background:#AD1F27">NÃO ENCONTRADA</div></div>');
  const linha = await env.DB.prepare("SELECT numero FROM autorizacoes WHERE token_qr = ?1").bind(token).first();
  const a = linha ? await carregar(env.DB, linha.numero) : null;
  if (!a) return pagina("Autorização", '<div class="card"><div class="selo" style="background:#AD1F27">NÃO ENCONTRADA</div><p class="mut">Este QR não corresponde a nenhuma autorização da HS Eletricidade.</p></div>');
  const p = publico(a);
  const cor = COR[p.status] || ["#667085", p.status.toUpperCase()];
  let det = '<dt>Tipo</dt><dd>' + esc(p.tipo) + '</dd><dt>Colaborador</dt><dd>' + esc(p.colaborador) + '</dd>' +
    '<dt>Obra / C. custo</dt><dd>' + esc((p.empresa ? p.empresa + " · " : "") + p.obra) + '</dd>';
  if (p.estabelecimento) det += '<dt>Estabelecimento</dt><dd>' + esc(p.estabelecimento) + '</dd>';
  if (p.veiculo) det += '<dt>Veículo</dt><dd>' + esc(p.veiculo) + (p.km ? " · km " + esc(p.km) : "") + '</dd>';
  if (p.combustivel) det += '<dt>Combustível</dt><dd>' + esc(p.combustivel) + (p.litros_max ? " · até " + esc(String(p.litros_max).replace(".", ",")) + " L" : "") + '</dd>';
  det += '<dt>Válida até</dt><dd>' + esc(quando(p.validade)) + '</dd>';
  if (p.autorizado_por) det += '<dt>Autorizado por</dt><dd>' + esc(p.autorizado_por) + ' em ' + esc(quando(p.decidido_em)) + '</dd>';
  let itens = "";
  if (p.itens.length) itens = '<div class="card"><b>Itens autorizados</b><ul>' + p.itens.map(function (x) {
    return '<li>' + esc(x.descricao) + (x.qtd != null ? ' — ' + esc(String(x.qtd).replace(".", ",")) + (x.unidade ? " " + esc(x.unidade) : "") : "") + '</li>';
  }).join("") + '</ul></div>';
  return pagina(p.numero, '<div class="card"><div class="mut">HS ELETRICIDADE · Autorização de compra</div><div class="n">' + esc(p.numero) + '</div>' +
    '<div class="selo" style="background:' + cor[0] + ';margin:12px 0">' + esc(cor[1]) + '</div><dl>' + det + '</dl></div>' + itens +
    '<p class="mut">Uso único. Confira se o número e o colaborador batem com o documento apresentado. Dúvidas: Suprimentos HS.</p>');
}
