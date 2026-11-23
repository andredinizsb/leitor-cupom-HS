// POST /api/gestao/rdo-acao — a gestão revisa o RDO antes de finalizar (login do Access, ver _middleware)
//   { numero, acao: "editar", campos: { cliente, descricao, ocorrencias, clima_manha, clima_tarde, km_inicial, km_final, responsavel, colaboradores } }
//   { numero, acao: "finalizar", assinatura: "data:image/png;base64,..." }  -> assinatura da gestão + status Finalizado (aí sai o relatório final)
import { resp, semBanco, ERRO_BANCO, txt, agora, assinaturaValida } from "../../../lib/aut.js";
import { CLIMAS, inteiro } from "../../../lib/rdo.js";

export async function onRequestPost({ request, env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const db = env.DB, numero = txt(d.numero, 30), quem = (data && data.quem) || "gestao";
  const r = numero && await db.prepare("SELECT numero, status, km_inicial, km_final FROM rdo WHERE numero = ?1").bind(numero).first();
  if (!r) return resp({ ok: false, erro: "nao_encontrado", msg: "RDO não encontrado." }, 404);
  if (r.status === "Finalizado") return resp({ ok: false, erro: "finalizado", msg: "Este RDO já foi finalizado." }, 409);

  if (d.acao === "editar") {
    const c = d.campos || {}, sets = [], vals = [];
    function por(col, v) { sets.push(col + " = ?" + (vals.length + 2)); vals.push(v); }
    if ("cliente" in c) { const v = txt(c.cliente, 120); if (!v) return resp({ ok: false, msg: "Informe o cliente." }, 400); por("cliente", v); }
    if ("descricao" in c) { const v = txt(c.descricao, 4000); if (!v) return resp({ ok: false, msg: "Informe as atividades." }, 400); por("descricao", v); }
    if ("ocorrencias" in c) por("ocorrencias", txt(c.ocorrencias, 2000));
    if ("responsavel" in c) { const v = txt(c.responsavel, 80); if (!v) return resp({ ok: false, msg: "Informe o responsável." }, 400); por("responsavel", v); }
    if ("clima_manha" in c) por("clima_manha", CLIMAS.includes(c.clima_manha) ? c.clima_manha : null);
    if ("clima_tarde" in c) por("clima_tarde", CLIMAS.includes(c.clima_tarde) ? c.clima_tarde : null);
    if ("km_inicial" in c || "km_final" in c) {
      const a = "km_inicial" in c ? inteiro(c.km_inicial) : r.km_inicial, b = "km_final" in c ? inteiro(c.km_final) : r.km_final;
      if (a == null || b == null || b < a) return resp({ ok: false, msg: "Confira o km inicial e o final." }, 400);
      por("km_inicial", a); por("km_final", b);
    }
    if ("colaboradores" in c) {
      const l = (Array.isArray(c.colaboradores) ? c.colaboradores : String(c.colaboradores || "").split(/[,;\n]/)).map(function (x) { return txt(x, 80); }).filter(Boolean).slice(0, 40);
      if (!l.length) return resp({ ok: false, msg: "Informe os colaboradores." }, 400);
      por("colaboradores", JSON.stringify(l));
    }
    if (!sets.length) return resp({ ok: false, msg: "Nada para alterar." }, 400);
    sets.push("editado_por = ?" + (vals.length + 2)); vals.push(quem);
    sets.push("editado_em = ?" + (vals.length + 2)); vals.push(agora());
    await db.prepare("UPDATE rdo SET " + sets.join(", ") + " WHERE numero = ?1").bind(numero, ...vals).run();
    return resp({ ok: true, numero: numero });
  }

  if (d.acao === "finalizar") {
    if (!assinaturaValida(d.assinatura)) return resp({ ok: false, erro: "sem_assinatura", msg: "Assine para finalizar o RDO." }, 400);
    await db.prepare("UPDATE rdo SET assinatura_gestao = ?2, assinado_gestao_por = ?3, assinado_gestao_em = ?4, status = 'Finalizado' WHERE numero = ?1")
      .bind(numero, d.assinatura, quem, agora()).run();
    return resp({ ok: true, numero: numero, status: "Finalizado" });
  }
  return resp({ ok: false, erro: "acao_invalida" }, 400);
}
