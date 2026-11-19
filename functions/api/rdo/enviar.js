// POST /api/rdo/enviar — o encarregado lança o RDO do dia pelo celular (sem login, como o app de despesas)
import { resp, origemOk, semBanco, ERRO_BANCO, txt, num, agora, aleatorio } from "../../../lib/aut.js";
import { CLIMAS, ETAPAS, MAX_FOTOS, MAX_FOTO_B64, SEM_VEICULO, inteiro, dataHora, bool, proximoNumeroRdo, separarFoto, b64ParaBytes } from "../../../lib/rdo.js";
import { ondeGuardar, comR2Contado, bytesB64 } from "../../../lib/fotos.js";

function erro(cod, msg) { return resp({ ok: false, erro: cod, msg: msg }, 400); }

export async function onRequestPost({ request, env }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return erro("json_invalido", "Não foi possível ler o RDO."); }

  const ini = dataHora(d.data_inicio), fim = dataHora(d.data_fim);
  if (!ini || !fim) return erro("sem_data", "Informe a data e hora de início e de fim.");
  if (fim < ini) return erro("data_invertida", "O fim não pode ser antes do início.");
  const cliente = txt(d.cliente, 120);
  if (!cliente) return erro("sem_cliente", "Informe o cliente.");
  const colaboradores = (Array.isArray(d.colaboradores) ? d.colaboradores : []).map(function (c) { return txt(c, 80); }).filter(Boolean).slice(0, 40);
  if (!colaboradores.length) return erro("sem_colaboradores", "Marque os colaboradores envolvidos.");
  const descricao = txt(d.descricao, 4000);
  if (!descricao) return erro("sem_descricao", "Descreva as atividades do dia.");
  const frota = txt(d.frota, 60);
  if (!frota) return erro("sem_frota", "Escolha o veículo do deslocamento.");
  const kmI = inteiro(d.km_inicial), kmF = inteiro(d.km_final);
  if (kmI == null || kmF == null) return erro("sem_km", "Informe o km inicial e o final.");
  if (kmF < kmI) return erro("km_invertido", "O km final não pode ser menor que o inicial.");
  const mesma = d.mesma_frota !== false && d.mesma_frota !== "NÃO";
  let frotaExec = null, kmEI = null, kmEF = null;
  if (!mesma) {
    frotaExec = txt(d.frota_exec, 60) || SEM_VEICULO;
    if (frotaExec !== SEM_VEICULO) {
      kmEI = inteiro(d.km_exec_inicial); kmEF = inteiro(d.km_exec_final);
      if (kmEI == null || kmEF == null) return erro("sem_km_exec", "Informe o km do veículo da execução.");
      if (kmEF < kmEI) return erro("km_exec_invertido", "O km final da execução não pode ser menor que o inicial.");
    }
  }
  const houve = bool(d.houve_material);
  const materiais = houve ? (Array.isArray(d.materiais) ? d.materiais : []).slice(0, 40).map(function (m) {
    return { descricao: txt(m && m.descricao, 160), qtd: num(m && m.qtd), unidade: txt(m && m.unidade, 10) };
  }).filter(function (m) { return m.descricao; }) : [];
  if (houve && !materiais.length) return erro("sem_materiais", "Informe os materiais aplicados.");
  const responsavel = txt(d.responsavel, 80);
  if (!responsavel) return erro("sem_responsavel", "Informe o responsável pelo lançamento.");
  const s = d.seguranca || {};
  const seguranca = JSON.stringify({ dds: !!s.dds, apr: !!s.apr, pt: !!s.pt });
  const lat = num(d.lat), lon = num(d.lon), prec = num(d.precisao);

  const fotos = [];
  for (const f of (Array.isArray(d.fotos) ? d.fotos : []).slice(0, MAX_FOTOS)) {
    const p = separarFoto(f && f.dados);
    if (!p) return erro("foto_invalida", "Uma das fotos não é imagem.");
    if (p.b64.length > MAX_FOTO_B64) return erro("foto_grande", "Uma das fotos ficou grande demais. Tire de novo.");
    fotos.push({ tipo: p.tipo, b64: p.b64, etapa: ETAPAS.includes(f.etapa) ? f.etapa : null, legenda: txt(f.legenda, 200) });
  }

  // tetos do plano grátis (lib/fotos.js): D1 até ~1.500 fotos, depois R2; sem espaço = RDO vai sem as fotos, com aviso
  env = comR2Contado(env);
  let aviso = null;
  const onde = fotos.length ? await ondeGuardar(env, fotos.reduce(function (s, f) { return s + bytesB64(f.b64); }, 0)) : "d1";
  if (!onde) { fotos.length = 0; aviso = "O RDO foi salvo, mas as fotos NÃO: o espaço grátis do app está cheio. Avise o Suprimentos e guarde as fotos no celular."; }
  const db = env.DB, ano = Number(ini.slice(0, 4)) || new Date().getFullYear(), quando = agora(), chave = aleatorio(18);
  let numero = null;
  for (let tentativa = 0; tentativa < 3 && !numero; tentativa++) {
    const n = await proximoNumeroRdo(db, ano);
    try {
      await db.prepare("INSERT INTO rdo (numero, criado_em, data_inicio, data_fim, empresa, cliente, obra, obra_desc, colaboradores, descricao, frota, km_inicial, km_final, " +
        "mesma_frota, frota_exec, km_exec_inicial, km_exec_final, houve_material, materiais, clima_manha, clima_tarde, ocorrencias, seguranca, responsavel, lat, lon, precisao, qtd_fotos, chave) " +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29)")
        .bind(n, quando, ini, fim, ["HS", "MC"].includes(d.empresa) ? d.empresa : null, cliente, txt(d.obra, 30), txt(d.obra_desc, 160), JSON.stringify(colaboradores), descricao,
              frota, kmI, kmF, mesma ? 1 : 0, frotaExec, kmEI, kmEF, houve ? 1 : 0, JSON.stringify(materiais),
              CLIMAS.includes(d.clima_manha) ? d.clima_manha : null, CLIMAS.includes(d.clima_tarde) ? d.clima_tarde : null, txt(d.ocorrencias, 2000), seguranca, responsavel,
              lat, lon, prec, fotos.length, chave).run();
      numero = n;
    } catch (e) {
      if (!/UNIQUE|constraint/i.test(String(e && e.message))) throw e;   // outro RDO pegou o mesmo número: tenta o próximo
    }
  }
  if (!numero) return resp({ ok: false, erro: "numero_ocupado", msg: "Tente enviar de novo." }, 503);

  let salvas = 0;
  const usarR2 = onde === "r2";
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i], ext = f.tipo === "image/png" ? "png" : f.tipo === "image/webp" ? "webp" : "jpg";
    let r2 = null, dados = f.b64;
    if (usarR2) {
      r2 = "rdo/" + ano + "/" + numero + "/" + (i + 1) + "." + ext;
      await env.FOTOS.put(r2, b64ParaBytes(f.b64), { httpMetadata: { contentType: f.tipo } });
      dados = null;
    }
    await db.prepare("INSERT INTO rdo_fotos (numero, ordem, etapa, legenda, tipo, tamanho, r2_key, dados, criado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
      .bind(numero, i + 1, f.etapa, f.legenda, f.tipo, bytesB64(f.b64), r2, dados, quando).run();
    salvas++;
  }
  return resp({ ok: true, numero: numero, chave: chave, fotos: salvas, aviso: aviso });
}
