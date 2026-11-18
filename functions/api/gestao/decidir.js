// POST /api/gestao/decidir { numero, acao: "aprovar" | "recusar" | "cancelar", validade (ISO), motivo }
// Aprovar = emitir: gera o QR de validação e fixa a validade escolhida por quem aprova.
import { resp, semBanco, ERRO_BANCO, txt, agora, aleatorio, historico, STATUS_ATIVOS } from "../../../lib/aut.js";

export async function onRequestPost({ request, env, data }) {
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const db = env.DB, quem = data.quem, numero = String(d.numero || "").trim();
  const a = await db.prepare("SELECT numero, status, validade FROM autorizacoes WHERE numero = ?1").bind(numero).first();
  if (!a) return resp({ ok: false, erro: "nao_encontrada" }, 404);
  const motivo = txt(d.motivo, 300);
  if (d.acao === "aprovar") {
    if (a.status !== "Pendente") return resp({ ok: false, erro: "nao_pendente", msg: "Só autorizações pendentes podem ser aprovadas." }, 409);
    const val = String(d.validade || "");
    const dt = new Date(val);
    if (!val || isNaN(dt.getTime())) return resp({ ok: false, erro: "sem_validade", msg: "Informe até quando vale a autorização." }, 400);
    if (dt.getTime() <= Date.now()) return resp({ ok: false, erro: "validade_passada", msg: "A validade precisa ser no futuro." }, 400);
    await db.batch([
      db.prepare("UPDATE autorizacoes SET status = 'Emitida', validade = ?2, decidido_por = ?3, decidido_em = ?4, token_qr = ?5, motivo = NULL WHERE numero = ?1 AND status = 'Pendente'")
        .bind(numero, dt.toISOString(), quem, agora(), aleatorio(18)),
      historico(db, numero, quem, a.status, "Emitida", "válida até " + dt.toISOString())
    ]);
    return resp({ ok: true, status: "Emitida" });
  }
  if (d.acao === "recusar") {
    if (a.status !== "Pendente") return resp({ ok: false, erro: "nao_pendente" }, 409);
    if (!motivo) return resp({ ok: false, erro: "sem_motivo", msg: "Informe o motivo da recusa." }, 400);
    await db.batch([
      db.prepare("UPDATE autorizacoes SET status = 'Recusada', decidido_por = ?2, decidido_em = ?3, motivo = ?4 WHERE numero = ?1").bind(numero, quem, agora(), motivo),
      historico(db, numero, quem, a.status, "Recusada", motivo)
    ]);
    return resp({ ok: true, status: "Recusada" });
  }
  if (d.acao === "cancelar") {
    if (!(a.status === "Pendente" || STATUS_ATIVOS.includes(a.status))) return resp({ ok: false, erro: "nao_cancelavel", msg: "Esta autorização está " + a.status + "." }, 409);
    if (!motivo) return resp({ ok: false, erro: "sem_motivo", msg: "Informe o motivo do cancelamento." }, 400);
    await db.batch([
      db.prepare("UPDATE autorizacoes SET status = 'Cancelada', motivo = ?2 WHERE numero = ?1").bind(numero, motivo),
      historico(db, numero, quem, a.status, "Cancelada", motivo)
    ]);
    return resp({ ok: true, status: "Cancelada" });
  }
  return resp({ ok: false, erro: "acao_invalida" }, 400);
}
