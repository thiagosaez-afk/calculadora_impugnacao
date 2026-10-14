'use strict';
// Leitura e validação da curva colada na tela administrativa (colunas Data, IPCA, CDI da planilha).
const { eomonth, toISO, parseISO } = require('./engine');

function numero(txt) {
  let s = String(txt).trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function data(txt) {
  const s = String(txt).trim();
  let m;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (/^\d{5}$/.test(s)) return Date.UTC(1899, 11, 30) + Number(s) * 86400000; // serial do Excel
  return NaN;
}

function lerCurva(texto, dataBaseISO) {
  const linhas = String(texto).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const curvas = [];
  for (const [i, linha] of linhas.entries()) {
    const col = linha.split(/\t|;|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (col.length < 3) {
      if (i === 0) continue; // cabeçalho
      throw new Error(`Linha ${i + 1}: esperado Data, IPCA e CDI.`);
    }
    const d = data(col[0]);
    if (Number.isNaN(d)) {
      if (i === 0) continue;
      throw new Error(`Linha ${i + 1}: data não reconhecida (${col[0]}).`);
    }
    const ipca = numero(col[1]);
    const cdi = numero(col[2]);
    if (!(ipca > 0) || !(cdi > 0)) throw new Error(`Linha ${i + 1}: IPCA e CDI devem ser números positivos.`);
    curvas.push({ d: toISO(eomonth(d, 0)), ipca, cdi });
  }
  if (curvas.length < 60) throw new Error(`Curva com ${curvas.length} linhas; esperado 60 ou mais.`);
  for (let i = 1; i < curvas.length; i++) {
    const esperado = toISO(eomonth(parseISO(curvas[i - 1].d), 1));
    if (curvas[i].d !== esperado) throw new Error(`Meses fora de ordem ou faltando perto de ${curvas[i].d}.`);
    if (curvas[i].cdi < curvas[i - 1].cdi) throw new Error(`CDI acumulado cai em ${curvas[i].d}.`);
  }
  const hoje = toISO(eomonth(parseISO(dataBaseISO), 0));
  const ultima = curvas[curvas.length - 1].d;
  if (!curvas.some((c) => c.d === hoje)) throw new Error(`A curva não contém o mês da data-base (${hoje}).`);
  if (ultima < toISO(eomonth(parseISO(hoje), 60))) throw new Error('A curva precisa ir pelo menos 60 meses além da data-base.');
  return curvas;
}

module.exports = { lerCurva };
