// POST /api/checklist/enviar — o condutor faz o checklist do veículo pelo celular (sem login, como o RDO)
import { resp, origemOk, semBanco, ERRO_BANCO, txt, num, agora } from "../../../lib/aut.js";
import { MAX_FOTOS, MAX_FOTO_B64, inteiro, dataHora, separarFoto, b64ParaBytes } from "../../../lib/rdo.js";
import { AVARIAS, SECOES, ITENS, avarias, proximoNumeroChk } from "../../../lib/checklist.js";
import { guardarNoR2, bytesB64 } from "../../../lib/fotos.js";

function erro(cod, msg) { return resp({ ok: false, erro: cod, msg: msg }, 400); }

export async function onRequestPost({ request, env }) {
  if (!origemOk(request)) return resp({ ok: false, erro: "origem_nao_permitida" }, 403);
  if (semBanco(env)) return resp(ERRO_BANCO, 503);
  let d;
  try { d = await request.json(); } catch (e) { return erro("json_invalido", "Não foi possível ler o checklist."); }
  const quandoCheck = dataHora(d.data_check);
  if (!quandoCheck) return erro("sem_data", "Data e hora do checklist inválidas.");
  const frota = txt(d.frota, 60), condutor = txt(d.condutor, 80), hodo = inteiro(d.hodometro);
  if (!frota) return erro("sem_frota", "Escolha o veículo.");
  if (!condutor) return erro("sem_condutor", "Escolha o condutor.");
  if (hodo == null) return erro("sem_hodometro", "Informe o hodômetro (km).");
  const kmOleo = txt(d.km_troca_oleo, 60);
  if (!kmOleo) return erro("sem_km_oleo", "Informe o km da próxima troca de óleo (ou NÃO SEI).");
  const av = { frente: avarias(d.avaria_frente, AVARIAS.frente), lat_esq: avarias(d.avaria_lat_esq, AVARIAS.lat_esq),
    traseira: avarias(d.avaria_traseira, AVARIAS.traseira), lat_dir: avarias(d.avaria_lat_dir, AVARIAS.lat_dir) };
  const ok = (Array.isArray(d.itens_ok) ? d.itens_ok : []).filter(function (x) { return ITENS.includes(x); });
  const prob = (Array.isArray(d.itens_problema) ? d.itens_problema : []).filter(function (x) { return ITENS.includes(x) && !ok.includes(x); });
  const fotos = [];
  for (const f of (Array.isArray(d.fotos) ? d.fotos : []).slice(0, MAX_FOTOS)) {
    const p = separarFoto(f && f.dados);
    if (!p) return erro("foto_invalida", "Uma das fotos não é imagem.");
    if (p.b64.length > MAX_FOTO_B64) return erro("foto_grande", "Uma das fotos ficou grande demais. Tire de novo.");
    fotos.push({ tipo: p.tipo, b64: p.b64, secao: SECOES.includes(f.secao) ? f.secao : "Geral", legenda: txt(f.legenda, 200) });
  }
  const db = env.DB, ano = Number(quandoCheck.slice(0, 4)) || new Date().getFullYear(), quando = agora();
  let numero = null;
  for (let t = 0; t < 3 && !numero; t++) {
    const n = await proximoNumeroChk(db, ano);
    try {
      await db.prepare("INSERT INTO checklist (numero, criado_em, data_check, frota, condutor, hodometro, km_troca_oleo, avaria_frente, avaria_lat_esq, avaria_traseira, avaria_lat_dir, " +
        "itens_ok, itens_problema, obs, lat, lon, precisao, qtd_fotos) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)")
        .bind(n, quando, quandoCheck, frota, condutor, hodo, kmOleo, JSON.stringify(av.frente), JSON.stringify(av.lat_esq), JSON.stringify(av.traseira), JSON.stringify(av.lat_dir),
              JSON.stringify(ok), JSON.stringify(prob), txt(d.obs, 2000), num(d.lat), num(d.lon), num(d.precisao), fotos.length).run();
      numero = n;
    } catch (e) { if (!/UNIQUE|constraint/i.test(String(e && e.message))) throw e; }
  }
  if (!numero) return resp({ ok: false, erro: "numero_ocupado", msg: "Tente enviar de novo." }, 503);
  const usarR2 = fotos.length ? await guardarNoR2(env) : false;   // R2 só depois de ~1.500 fotos no D1 (lib/fotos.js)
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i], ext = f.tipo === "image/png" ? "png" : f.tipo === "image/webp" ? "webp" : "jpg";
    let r2 = null, dados = f.b64;
    if (usarR2) { r2 = "checklist/" + ano + "/" + numero + "/" + (i + 1) + "." + ext; await env.FOTOS.put(r2, b64ParaBytes(f.b64), { httpMetadata: { contentType: f.tipo } }); dados = null; }
    await db.prepare("INSERT INTO checklist_fotos (numero, ordem, secao, legenda, tipo, tamanho, r2_key, dados, criado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
      .bind(numero, i + 1, f.secao, f.legenda, f.tipo, bytesB64(f.b64), r2, dados, quando).run();
  }
  return resp({ ok: true, numero: numero, fotos: fotos.length, problemas: prob.length });
}
