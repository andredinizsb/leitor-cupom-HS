// GET /api/gestao/autorizacoes?status=Pendente|Emitida|...|todas&q=texto — lista para Suprimentos
import { resp, semBanco, ERRO_BANCO, statusVisivel, agora } from "../../../lib/aut.js";

export async function onRequestGet({ request, env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  const u = new URL(request.url);
  const st = u.searchParams.get("status") || "todas";
  const q = (u.searchParams.get("q") || "").trim().toLowerCase();
  const db = env.DB;
  // sem a imagem da assinatura (pesada): o canhoto completo vem de /api/gestao/canhoto
  const rs = await db.prepare("SELECT numero, tipo, colaborador, empresa, obra, estabelecimento, veiculo, marca_modelo, km, combustivel, litros_max, justificativa, status, solicitado_em, validade, decidido_por, decidido_em, motivo, token_qr, chave_solicitante, assinado_por_nome, (assinatura IS NOT NULL) AS tem_assinatura FROM autorizacoes ORDER BY solicitado_em DESC LIMIT 500").all();
  const lista = rs.results || [];
  const nums = lista.map(function (a) { return a.numero; });
  const itens = {}, atend = {};
  if (nums.length) {
    const it = await db.prepare("SELECT numero, item, descricao, qtd, unidade FROM autorizacao_itens WHERE numero IN (SELECT numero FROM autorizacoes ORDER BY solicitado_em DESC LIMIT 500) ORDER BY numero, item").all();
    (it.results || []).forEach(function (x) { (itens[x.numero] = itens[x.numero] || []).push(x); });
    const at = await db.prepare("SELECT numero, registrado_em, data_cupom, cnpj, estabelecimento, chave_nfce, numero_nf, valor_total, parcial, observacao FROM atendimentos WHERE numero IN (SELECT numero FROM autorizacoes ORDER BY solicitado_em DESC LIMIT 500) ORDER BY id").all();
    (at.results || []).forEach(function (x) { (atend[x.numero] = atend[x.numero] || []).push(x); });
  }
  const t = agora();
  const contagem = {};
  const out = [];
  lista.forEach(function (a) {
    a.status_visivel = statusVisivel(a, t);
    contagem[a.status_visivel] = (contagem[a.status_visivel] || 0) + 1;
    a.itens = itens[a.numero] || [];
    a.atendimentos = atend[a.numero] || [];
    if (st !== "todas" && a.status_visivel !== st) return;
    if (q) {
      const alvo = [a.numero, a.colaborador, a.obra, a.tipo, a.veiculo, a.estabelecimento].join(" ").toLowerCase();
      if (alvo.indexOf(q) < 0) return;
    }
    out.push(a);
  });
  return resp({ ok: true, quem: data.quem, contagem: contagem, autorizacoes: out });
}
