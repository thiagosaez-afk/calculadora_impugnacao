'use strict';
// Motor de cálculo da calculadora de impugnação.
// Baseado na planilha "Planilha de impugnação_v2" (abas Inputs e Mecânica).
// Três cenários, cada um com prazo próprio (e probabilidade própria quando há controverso):
//   1. não impugnar: recebe só o incontroverso
//   2. receber tudo em até 6 meses (um levantamento só)
//   3. receber tudo em até 12 meses (um levantamento só)

const MS_DIA = 86400000;

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Equivalente a EOMONTH(data, meses) do Excel
function eomonth(ms, meses) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses + 1, 0);
}

function indexarCurvas(curvas) {
  const mapa = new Map();
  for (const c of curvas) mapa.set(c.d, c);
  return mapa;
}

function fator(mapa, ms, campo) {
  const c = mapa.get(toISO(ms));
  if (!c) throw new ErroCalculo('Prazo fora da curva de índices disponível.');
  return c[campo];
}

class ErroCalculo extends Error {}

// TIR mensal por bisseção. fluxos = [[meses, valor], ...]. Retorna null se não houver solução.
function tirMensal(fluxos) {
  const vp = (r) => fluxos.reduce((s, [m, v]) => s + v / Math.pow(1 + r, m), 0);
  let lo = -0.9;
  let hi = 2;
  let fLo = vp(lo);
  const fHi = vp(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const f = vp(mid);
    if (f * fLo > 0) { lo = mid; fLo = f; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

// Alvo = TIR da Sub (júnior), o retorno que interessa à companhia.
// Linha de corte = TIR da Senior: abaixo dela a Sub rende menos que a cota mais barata.
function veredito(tirSub, tirSenior, margem) {
  if (tirSub === null || tirSenior === null) return 'nao_vale';
  const spread = tirSub - tirSenior;
  if (spread > margem) return 'vale';
  if (spread < -margem) return 'nao_vale';
  return 'limitrofe';
}

/**
 * entrada: {
 *   incontroverso, atualizado,                     // R$, valores de hoje
 *   naoImpugnar: { meses },                        // mês em que o incontroverso entra
 *   receber6:  { meses, totalEsperado, probabilidade },   // tudo em um levantamento só
 *   receber12: { meses, totalEsperado, probabilidade },
 * }
 * totalEsperado = valor total (incontroverso + controverso) esperado na data do recebimento.
 * probabilidade = chave: Zero | Remoto | Possível | Provável | Certo (vale só para o controverso).
 */
function calcular(entrada, config, base) {
  const mapa = indexarCurvas(base.curvas);
  const { incontroverso: inc, atualizado: atu } = entrada;

  const hoje = eomonth(parseISO(base.dataBase), 0);
  const anos = (d) => (d - hoje) / MS_DIA / 365;
  const meses = (d) => 12 * anos(d);

  const { senior: sSen, mezz: sMez } = config.spreads;
  const { senior: pSen, mezz: pMez, sub: pSub } = config.proporcoes;
  const sen = atu * pSen;
  const mez = atu * pMez;
  const sub = atu * pSub;

  // Cota acumulada até a data d: CDI anualizado do período x (1+spread), composto pelo prazo
  const cotaEm = (d, principal, spread) => {
    const y = anos(d);
    const cdi = Math.pow(fator(mapa, d, 'cdi') / fator(mapa, hoje, 'cdi'), 1 / y);
    return principal * Math.pow(cdi * (1 + spread), y);
  };
  const seniorEm = (d) => cotaEm(d, sen, sSen);
  const passivoEm = (d) => seniorEm(d) + cotaEm(d, mez, sMez);

  // Incontroverso corrigido pelo IPCA de hoje até a data d
  const incontroversoEm = (d) => inc * (fator(mapa, d, 'ipca') / fator(mapa, hoje, 'ipca'));

  const probabilidade = (chave) => {
    const p = config.probabilidades[chave];
    if (p === undefined) throw new ErroCalculo('Probabilidade inválida.');
    return p;
  };

  // Um recebimento único no mês indicado. Devolve as TIRs de Ativo, Senior, Passivo e Sub.
  const cenario = (mesesPrazo, recebimentoEm) => {
    const d = eomonth(hoje, mesesPrazo);
    const m = meses(d);
    const recebimento = recebimentoEm(d);
    const passivo = passivoEm(d);
    return {
      mes: mesesPrazo,
      recebimento,
      passivoValor: passivo,
      ativo: tirMensal([[0, -atu], [m, recebimento]]),
      passivo: tirMensal([[0, -(sen + mez)], [m, passivo]]),
      senior: tirMensal([[0, -sen], [m, seniorEm(d)]]),
      sub: tirMensal([[0, -sub], [m, recebimento - passivo]]),
    };
  };

  // Com controverso: incontroverso corrigido + (total esperado - incontroverso corrigido) x probabilidade
  const comControverso = (c) => {
    const p = probabilidade(c.probabilidade);
    return cenario(c.meses, (d) => {
      const incorrigido = incontroversoEm(d);
      return incorrigido + (c.totalEsperado - incorrigido) * p;
    });
  };

  const nao = cenario(entrada.naoImpugnar.meses, incontroversoEm);
  const c6 = comControverso(entrada.receber6);
  const c12 = comControverso(entrada.receber12);

  const margem = config.margemVeredito;
  const publico = (c) => ({
    tirAtivoAm: c.ativo,
    veredito: veredito(c.sub, c.senior, margem),
    recebimento: c.recebimento,
    mes: c.mes,
  });
  const interno = (c) => ({
    passivoTirAm: c.passivo,
    seniorTirAm: c.senior,
    subTirAm: c.sub,
    passivoValor: c.passivoValor,
  });

  return {
    // Vai ao advogado
    publico: { naoImpugnar: publico(nao), receber6: publico(c6), receber12: publico(c12) },
    // Só para teste e auditoria. Nunca serializar para o cliente.
    interno: { naoImpugnar: interno(nao), receber6: interno(c6), receber12: interno(c12) },
  };
}

module.exports = { calcular, tirMensal, eomonth, parseISO, toISO, ErroCalculo };
