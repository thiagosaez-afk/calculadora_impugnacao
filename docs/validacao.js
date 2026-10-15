'use strict';
// ARQUIVO GERADO por scripts/gerar-docs.js a partir de src/validacao.js. Não editar aqui.
(function () {
var module = { exports: {} };
// Valida a entrada do advogado e arredonda a saída. O cliente só recebe o que sai daqui.

function inteiro(v, min, max, nome) {
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${nome} deve ser um inteiro entre ${min} e ${max}.`);
  return v;
}

function valor(v, nome) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1e10) throw new Error(`${nome} deve ser um valor positivo.`);
  return v;
}

function validarEntrada(b, probabilidades) {
  const e = {
    incontroverso: valor(b.incontroverso, 'Valor incontroverso'),
    atualizado: valor(b.atualizado, 'Valor atualizado'),
    mesesPrimeiro: inteiro(b.mesesPrimeiro, 1, 120, 'Meses até o 1º levantamento'),
    mesesControverso: inteiro(b.mesesControverso, 2, 120, 'Meses até o levantamento do controverso'),
    mesesTotal: inteiro(b.mesesTotal, 2, 120, 'Meses até o levantamento total'),
    totalEmN: valor(b.totalEmN, 'Valor total esperado no levantamento do controverso'),
    totalEmT: valor(b.totalEmT, 'Valor total esperado no levantamento total'),
    probabilidade: String(b.probabilidade),
  };
  if (e.incontroverso > e.atualizado) throw new Error('O valor incontroverso não pode ser maior que o valor atualizado.');
  if (e.mesesControverso <= e.mesesPrimeiro) throw new Error('O levantamento do controverso deve vir depois do 1º levantamento.');
  if (!(e.probabilidade in probabilidades)) throw new Error('Probabilidade inválida.');
  return e;
}

const pct = (x) => (x === null ? null : Math.round(x * 10000) / 10000); // 0,01 p.p.
const reais = (x) => Math.round(x);

function arredondar(pub) {
  const d = pub.doisLevantamentos;
  const u = pub.umLevantamento;
  return {
    doisLevantamentos: {
      tirAtivoAm: pct(d.tirAtivoAm),
      veredito: d.veredito,
      recebimentoIncontroverso: reais(d.recebimentoIncontroverso),
      mesIncontroverso: d.mesIncontroverso,
      controversoEsperado: reais(d.controversoEsperado),
      mesControverso: d.mesControverso,
    },
    umLevantamento: {
      tirAtivoAm: pct(u.tirAtivoAm),
      veredito: u.veredito,
      recebimentoTotalEsperado: reais(u.recebimentoTotalEsperado),
      mesTotal: u.mesTotal,
    },
  };
}

module.exports = { validarEntrada, arredondar };

globalThis.Validacao = module.exports;
})();
