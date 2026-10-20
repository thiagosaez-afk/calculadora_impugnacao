'use strict';
// Valida a entrada do advogado e arredonda a saída. O cliente só recebe o que sai daqui.

function inteiro(v, min, max, nome) {
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${nome} deve ser um inteiro entre ${min} e ${max}.`);
  return v;
}

function valor(v, nome) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1e10) throw new Error(`${nome} deve ser um valor positivo.`);
  return v;
}

function bloco(b, nome) {
  if (!b || typeof b !== 'object') throw new Error(`Dados do cenário "${nome}" inválidos.`);
  return b;
}

function comControverso(b, nome, maxMeses, probabilidades) {
  const c = bloco(b, nome);
  const probabilidade = String(c.probabilidade);
  if (!(probabilidade in probabilidades)) throw new Error(`Probabilidade inválida no cenário "${nome}".`);
  return {
    meses: inteiro(c.meses, 1, maxMeses, `Meses até receber tudo (${nome})`),
    totalEsperado: valor(c.totalEsperado, `Valor total esperado (${nome})`),
    probabilidade,
  };
}

function validarEntrada(b, probabilidades) {
  const e = {
    incontroverso: valor(b.incontroverso, 'Valor incontroverso'),
    atualizado: valor(b.atualizado, 'Valor atualizado'),
    naoImpugnar: { meses: inteiro(bloco(b.naoImpugnar, 'Não impugnar').meses, 1, 120, 'Meses até receber o incontroverso (não impugnar)') },
    receber6: comControverso(b.receber6, 'até 6 meses', 6, probabilidades),
    receber12: comControverso(b.receber12, 'até 12 meses', 12, probabilidades),
  };
  if (e.incontroverso > e.atualizado) throw new Error('O valor incontroverso não pode ser maior que o valor atualizado.');
  return e;
}

const pct = (x) => (x === null ? null : Math.round(x * 10000) / 10000); // 0,01 p.p.
const reais = (x) => Math.round(x);

function arredondar(pub) {
  const um = (c) => ({ tirAtivoAm: pct(c.tirAtivoAm), veredito: c.veredito, recebimento: reais(c.recebimento), mes: c.mes });
  return { naoImpugnar: um(pub.naoImpugnar), receber6: um(pub.receber6), receber12: um(pub.receber12) };
}

module.exports = { validarEntrada, arredondar };
