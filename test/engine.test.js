'use strict';
// Confere o motor contra a planilha (cenário de 1 levantamento, Mecânica E25:E27) e as regras dos 3 cenários.
const nodeTest = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { calcular, eomonth, parseISO } = require('../src/engine');
const { validarEntrada } = require('../src/validacao');

// config.json e curvas.json não vão ao repositório; sem eles os testes são pulados.
const dir = path.join(__dirname, '..', 'data');
const temDados = fs.existsSync(path.join(dir, 'config.json')) && fs.existsSync(path.join(dir, 'curvas.json'));
const test = temDados ? nodeTest : nodeTest.skip;
const lerJSON = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
const config = temDados ? lerJSON('config.json') : null;
const base = temDados ? lerJSON('curvas.json') : null;

// Valores da planilha. Os totais esperados de 6 e 12 meses são fixtures de teste (premissa).
const caso = {
  incontroverso: 324612.67,
  atualizado: 352091.51,
  naoImpugnar: { meses: 1 },
  receber6: { meses: 6, totalEsperado: 380000, probabilidade: 'Certo' },
  receber12: { meses: 12, totalEsperado: 400622.5673993771, probabilidade: 'Certo' },
};

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test('um recebimento único em 14 meses bate com o cenário de 1 levantamento da planilha', () => {
  const c = { ...caso, receber12: { meses: 14, totalEsperado: 414109.7317573213, probabilidade: 'Certo' } };
  const r = calcular(c, config, base);
  perto(r.interno.receber12.passivoTirAm, 0.01064900663);
  perto(r.publico.receber12.tirAtivoAm, 0.011651383527937265);
  perto(r.interno.receber12.subTirAm, 0.017100061021162016);
  perto(r.interno.receber12.passivoValor, 347139.9805, 1e-3);
  perto(r.publico.receber12.recebimento, 414109.7318, 1e-3);
  perto(r.interno.receber12.seniorTirAm, 0.00989, 1e-4);
});

test('não impugnar: só o incontroverso, corrigido pelo IPCA até o mês de recebimento', () => {
  const r = calcular(caso, config, base).publico.naoImpugnar;
  const hoje = eomonth(parseISO(base.dataBase), 0);
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const ipca = (ms) => base.curvas.find((c) => c.d === iso(ms)).ipca;
  const esperado = caso.incontroverso * (ipca(eomonth(hoje, 1)) / ipca(hoje));
  perto(r.recebimento, esperado, 1e-6);
  assert.ok(r.tirAtivoAm < 0, 'recebe menos do que o valor atualizado, então a TIR é negativa');
  assert.strictEqual(r.veredito, 'nao_vale');
});

test('cada cenário usa a própria probabilidade', () => {
  const c = {
    ...caso,
    receber6: { ...caso.receber6, probabilidade: 'Zero' },
    receber12: { ...caso.receber12, probabilidade: 'Certo' },
  };
  const r = calcular(c, config, base);
  const hoje = eomonth(parseISO(base.dataBase), 0);
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const ipca = (ms) => base.curvas.find((x) => x.d === iso(ms)).ipca;
  // Zero: sobra só o incontroverso corrigido até o mês 6
  perto(r.publico.receber6.recebimento, caso.incontroverso * (ipca(eomonth(hoje, 6)) / ipca(hoje)), 1e-6);
  // Certo: recebe o total esperado
  perto(r.publico.receber12.recebimento, caso.receber12.totalEsperado, 1e-6);
  assert.strictEqual(r.publico.receber6.veredito, 'nao_vale');
});

test('probabilidade menor nunca melhora o resultado', () => {
  const ordem = ['Zero', 'Remoto', 'Possível', 'Provável', 'Certo'];
  let anterior = -Infinity;
  for (const p of ordem) {
    const r = calcular({ ...caso, receber12: { ...caso.receber12, probabilidade: p } }, config, base);
    assert.ok(r.publico.receber12.recebimento >= anterior, p);
    anterior = r.publico.receber12.recebimento;
  }
});

test('resultado público não expõe Passivo, Senior, Sub nem parâmetros de funding', () => {
  const txt = JSON.stringify(calcular(caso, config, base).publico).toLowerCase();
  for (const proibido of ['passivo', 'senior', 'sub"', 'subtir', 'funding', 'spread', 'cdi']) {
    assert.ok(!txt.includes(proibido), proibido);
  }
});

test('prazo fora da curva gera erro controlado', () => {
  assert.throws(() => calcular({ ...caso, naoImpugnar: { meses: 400 } }, config, base), /fora da curva/);
});

test('validação: limites de prazo, incontroverso e probabilidade', () => {
  const pr = config.probabilidades;
  assert.doesNotThrow(() => validarEntrada(caso, pr));
  assert.throws(() => validarEntrada({ ...caso, incontroverso: 999999999 }, pr), /não pode ser maior/);
  assert.throws(() => validarEntrada({ ...caso, receber6: { ...caso.receber6, meses: 7 } }, pr), /entre 1 e 6/);
  assert.throws(() => validarEntrada({ ...caso, receber12: { ...caso.receber12, meses: 13 } }, pr), /entre 1 e 12/);
  assert.throws(() => validarEntrada({ ...caso, receber12: { ...caso.receber12, probabilidade: 'Quase' } }, pr), /inválida/);
  assert.throws(() => validarEntrada({ ...caso, naoImpugnar: undefined }, pr), /inválidos/);
});
