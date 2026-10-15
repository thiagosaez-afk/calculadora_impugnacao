'use strict';
// ARQUIVO GERADO por scripts/gerar-docs.js a partir de src/engine.js. Não editar aqui.
(function () {
var module = { exports: {} };
// Motor de cálculo da calculadora de impugnação.
// Reproduz a planilha "Planilha de impugnação_v2" (abas Inputs e Mecânica).
// Roda só no servidor: config (spreads, proporções) e curvas nunca vão ao navegador.

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
 *   incontroverso, atualizado,            // R$, valores de hoje
 *   mesesPrimeiro, mesesControverso,      // 1º levantamento e levantamento do controverso (a partir de hoje)
 *   mesesTotal,                           // levantamento único (cenário de 1 levantamento)
 *   totalEmN, totalEmT,                   // valor total esperado em N e em T (Inputs E13 e E14)
 *   probabilidade                         // chave: Zero | Remoto | Possível | Provável | Certo
 * }
 */
function calcular(entrada, config, base) {
  const mapa = indexarCurvas(base.curvas);
  const { incontroverso: inc, atualizado: atu } = entrada;
  const p = config.probabilidades[entrada.probabilidade];
  if (p === undefined) throw new ErroCalculo('Probabilidade inválida.');

  const hoje = eomonth(parseISO(base.dataBase), 0);
  const d1 = eomonth(hoje, entrada.mesesPrimeiro);
  const dN = eomonth(hoje, entrada.mesesControverso);
  const dT = eomonth(hoje, entrada.mesesTotal);
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

  // Cenário 2 levantamentos: incontroverso em d1, controverso esperado em dN
  const ipca1N = fator(mapa, dN, 'ipca') / fator(mapa, d1, 'ipca');
  const controversoN = (entrada.totalEmN - inc * ipca1N) * p;
  const passivo1 = passivoEm(d1);
  const doisAtivo = tirMensal([[0, -atu], [meses(d1), inc], [meses(dN), controversoN]]);
  const doisPassivo = tirMensal([[0, -(sen + mez)], [meses(d1), passivo1]]);
  const doisSenior = tirMensal([[0, -sen], [meses(d1), seniorEm(d1)]]);
  const doisSub = tirMensal([[0, -sub], [meses(d1), inc - passivo1], [meses(dN), controversoN]]);

  // Cenário 1 levantamento: tudo em dT
  const ipcaT = fator(mapa, dT, 'ipca') / fator(mapa, hoje, 'ipca');
  const ativoT = inc * ipcaT + (entrada.totalEmT - inc * ipcaT) * p;
  const passivoT = passivoEm(dT);
  const umAtivo = tirMensal([[0, -atu], [meses(dT), ativoT]]);
  const umPassivo = tirMensal([[0, -(sen + mez)], [meses(dT), passivoT]]);
  const umSenior = tirMensal([[0, -sen], [meses(dT), seniorEm(dT)]]);
  const umSub = tirMensal([[0, -sub], [meses(dT), ativoT - passivoT]]);

  const margem = config.margemVeredito;
  return {
    // Vai ao advogado
    publico: {
      doisLevantamentos: {
        tirAtivoAm: doisAtivo,
        veredito: veredito(doisSub, doisSenior, margem),
        recebimentoIncontroverso: inc,
        mesIncontroverso: entrada.mesesPrimeiro,
        controversoEsperado: controversoN,
        mesControverso: entrada.mesesControverso,
      },
      umLevantamento: {
        tirAtivoAm: umAtivo,
        veredito: veredito(umSub, umSenior, margem),
        recebimentoTotalEsperado: ativoT,
        mesTotal: entrada.mesesTotal,
      },
    },
    // Só para teste e auditoria. Nunca serializar para o cliente.
    interno: {
      doisLevantamentos: {
        passivoTirAm: doisPassivo,
        seniorTirAm: doisSenior,
        subTirAm: doisSub,
        passivoEmD1: passivo1,
      },
      umLevantamento: {
        passivoTirAm: umPassivo,
        seniorTirAm: umSenior,
        subTirAm: umSub,
        passivoEmT: passivoT,
      },
    },
  };
}

module.exports = { calcular, tirMensal, eomonth, parseISO, toISO, ErroCalculo };

globalThis.Motor = module.exports;
})();
