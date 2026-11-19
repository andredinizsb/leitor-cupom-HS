// POST /api/aut/solicitar — o colaborador pede uma autorização (fica Pendente até Suprimentos aprovar)
import { resp, origemOk, semBanco, ERRO_BANCO, TIPOS, COMBUSTIVEIS, txt, num, soDigitos, agora, aleatorio, proximoNumero, historico } from "../../../lib/aut.js";

export async function onRequestPost({ request, env }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return resp({ ok: false, erro: "json_invalido" }, 400); }
  const tipo = txt(d.tipo, 40), colaborador = txt(d.colaborador, 80), obra = txt(d.obra, 60);
  if (!TIPOS.includes(tipo)) return resp({ ok: false, erro: "tipo_invalido", msg: "Escolha o tipo." }, 400);
  if (!colaborador) return resp({ ok: false, erro: "sem_colaborador", msg: "Informe o colaborador." }, 400);
  if (!obra) return resp({ ok: false, erro: "sem_obra", msg: "Informe a obra ou o centro de custo." }, 400);
  const empresa = ["HS", "MC"].includes(d.empresa) ? d.empresa : null;
  const abast = tipo === "Abastecimento";
  const combustivel = abast ? (COMBUSTIVEIS.includes(d.combustivel) ? d.combustivel : null) : null;
  const veiculo = txt(d.veiculo, 40);
  if (abast && !veiculo) return resp({ ok: false, erro: "sem_veiculo", msg: "Abastecimento precisa do veículo." }, 400);
  if (abast && !combustivel) return resp({ ok: false, erro: "sem_combustivel", msg: "Escolha o combustível." }, 400);
  const itens = (Array.isArray(d.itens) ? d.itens : []).slice(0, 30).map(function (x) {
    return { descricao: txt(x && x.descricao, 160), qtd: num(x && x.qtd), unidade: txt(x && x.unidade, 10) };
  }).filter(function (x) { return x.descricao; });
  if (!abast && !itens.length) return resp({ ok: false, erro: "sem_itens", msg: "Informe ao menos um item." }, 400);

  const db = env.DB;
  const ano = new Date().getFullYear();
  const numero = await proximoNumero(db, ano);
  const chave = aleatorio(18);
  const ops = [
    db.prepare("INSERT INTO autorizacoes (numero, tipo, colaborador, empresa, obra, estabelecimento, veiculo, km, combustivel, litros_max, justificativa, status, solicitado_em, chave_solicitante, marca_modelo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'Pendente', ?12, ?13, ?14)")
      .bind(numero, tipo, colaborador, empresa, obra, txt(d.estabelecimento, 120), veiculo, abast && soDigitos(d.km) ? parseInt(soDigitos(d.km), 10) : null, combustivel,
            abast ? num(d.litros_max) : null, txt(d.justificativa, 400), agora(), chave, abast ? txt(d.marca_modelo, 60) : null),
    historico(db, numero, colaborador, null, "Pendente", "solicitada pelo app")
  ];
  itens.forEach(function (x, i) {
    ops.push(db.prepare("INSERT INTO autorizacao_itens (numero, item, descricao, qtd, unidade) VALUES (?1, ?2, ?3, ?4, ?5)").bind(numero, i + 1, x.descricao, x.qtd, x.unidade));
  });
  await db.batch(ops);
  return resp({ ok: true, numero: numero, chave: chave, status: "Pendente" });
}
