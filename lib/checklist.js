// HS Gestão · Checklist digital do veículo — substitui o Jotform "Checklist Carros de Frota" (mesmas perguntas e opções).
import { brData, criadoLocal, lista } from "./rdo.js";

export const NADA = "NADA CONSTA";
export const AVARIAS = {
  frente: ["TETO", "PARABRISA", "CAPO", "PARACHOQUE"],
  lat_esq: ["PARALAMA DIANT.", "RETROVISOR", "PORTA DIANT.", "PORTA TRAS.", "LATERAL"],
  traseira: ["TAMPA TRASEIRA", "LANTERNAS DIR.", "LANTERNA ESQ.", "PARACHOQUE TRAS.", "ESTEPE", "MACACO", "CHAVE DE RODA", "TRIANGULO"],
  lat_dir: ["LATERAL", "PORTA TRAS.", "PORTA DIANT.", "RETROVISOR", "PARALAMA DIANT."]
};
export const SECOES = ["Frente", "Lateral esquerda", "Traseira", "Lateral direita", "Geral"];
export const ITENS = ["Nível de Óleo do motor", "Freio de mão funcionando e bem regulado", "Freio de pé funcionando e firme",
  "Cintos de segurança dianteiros e traseiros em perfeito estado", "Buzina funcionando", "Farol Alto funcionando", "Farol baixo funcionando",
  "Pisca-alerta funcionando", "Setas dianteiras e traseiras", "Luz de óleo, motor, freio e bateria no painel (devem apagar após dar partida)",
  "Medidor de combustível funcionando", "Limpador de para-brisa e esguicho funcionando", "Pneus sem desgaste excessivo ou deformações",
  "Portas abrem e fecham normalmente", "Vidros sobem e descem corretamente", "Retrovisores intactos", "Dirigibilidade Ok? Sem trepidações.",
  "Documento do veículo (CRLV) válido", "Tacógrafo valido?"];

// só aceita opções da lista; NADA CONSTA vale sozinho
export function avarias(v, opcoes) {
  const l = (Array.isArray(v) ? v : []).map(String).filter(function (x) { return x === NADA || opcoes.includes(x); });
  return l.includes(NADA) && l.length > 1 ? l.filter(function (x) { return x !== NADA; }) : l;
}

export async function proximoNumeroChk(db, ano) {
  const r = await db.prepare("SELECT numero FROM checklist WHERE numero LIKE ?1 ORDER BY numero DESC LIMIT 1").bind("CHK-" + ano + "-%").first();
  const n = r && r.numero ? parseInt(String(r.numero).slice(9), 10) + 1 : 1;
  return "CHK-" + ano + "-" + String(n).padStart(6, "0");
}

// mesmo formato do Jotform (a planilha junta os dois na tabela tChecklist)
export function linhaPlanilha(c) {
  return {
    Criado: criadoLocal(c.criado_em), DataCheck: brData(c.data_check), Frota: c.frota || "", Condutor: c.condutor || "",
    Hodometro: c.hodometro == null ? "" : String(c.hodometro), ItensSeguranca: lista(c.itens_ok).join(", "),
    AvariaFrente: lista(c.avaria_frente).join(", "), AvariaLatEsq: lista(c.avaria_lat_esq).join(", "),
    AvariaTraseira: lista(c.avaria_traseira).join(", "), AvariaLatDir: lista(c.avaria_lat_dir).join(", "),
    Obs: c.obs || "", KmTrocaOleo: c.km_troca_oleo || "",
    Numero: c.numero, ItensComProblema: lista(c.itens_problema).join(", "), Fotos: c.qtd_fotos || 0, Origem: "App"
  };
}
