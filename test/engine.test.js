'use strict';
// Confere o motor contra os valores calculados pela planilha (Mecânica F11:F13 e E25:E27).
const nodeTest = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { calcular } = require('../src/engine');

// config.json e curvas.json não vão ao repositório; sem eles os testes são pulados.
const dir = path.join(__dirname, '..', 'data');
const temDados = fs.existsSync(path.join(dir, 'config.json')) && fs.existsSync(path.join(dir, 'curvas.json'));
const test = temDados ? nodeTest : nodeTest.skip;
const lerJSON = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
const config = temDados ? lerJSON('config.json') : null;
const base = temDados ? lerJSON('curvas.json') : null;

const caso = {
  incontroverso: 324612.67,
  atualizado: 352091.51,
  mesesPrimeiro: 1,
  mesesControverso: 12,
  mesesTotal: 14,
  totalEmN: 400622.5673993771,
  totalEmT: 414109.7317573213,
  probabilidade: 'Certo',
};

const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test('2 levantamentos: Passivo, Ativo e Sub batem com a planilha', () => {
  const r = calcular(caso, config, base);
  perto(r.interno.doisLevantamentos.passivoTirAm, 0.0111368674);
  perto(r.publico.doisLevantamentos.tirAtivoAm, 0.03820546392980351);
  perto(r.interno.doisLevantamentos.subTirAm, 0.05626310417876157);
  perto(r.interno.doisLevantamentos.passivoEmD1, 302564.8929, 1e-3);
  perto(r.publico.doisLevantamentos.controversoEsperado, 61573.24605, 1e-3);
});

test('1 levantamento: Passivo, Ativo e Sub batem com a planilha', () => {
  const r = calcular(caso, config, base);
  perto(r.interno.umLevantamento.passivoTirAm, 0.01064900663);
  perto(r.publico.umLevantamento.tirAtivoAm, 0.011651383527937265);
  perto(r.interno.umLevantamento.subTirAm, 0.017100061021162016);
  perto(r.interno.umLevantamento.passivoEmT, 347139.9805, 1e-3);
  perto(r.publico.umLevantamento.recebimentoTotalEsperado, 414109.7318, 1e-3);
});

test('resultado público não expõe Passivo, Sub nem parâmetros de funding', () => {
  const r = calcular(caso, config, base);
  const txt = JSON.stringify(r.publico);
  for (const proibido of ['passivo', 'sub', 'funding', 'spread', 'cdi']) {
    assert.ok(!txt.toLowerCase().includes(proibido), proibido);
  }
});

test('probabilidade Zero zera o controverso e não quebra', () => {
  const r = calcular({ ...caso, probabilidade: 'Zero' }, config, base);
  assert.strictEqual(r.publico.doisLevantamentos.controversoEsperado, 0);
  assert.strictEqual(r.publico.doisLevantamentos.veredito, 'nao_vale');
});

test('veredito compara a TIR da Sub (alvo) com a da Senior (linha de corte)', () => {
  const esperado = {
    Certo: ['vale', 'vale'],
    'Provável': ['vale', 'nao_vale'],
    'Possível': ['nao_vale', 'nao_vale'],
    Remoto: ['nao_vale', 'nao_vale'],
    Zero: ['nao_vale', 'nao_vale'],
  };
  for (const [prob, [v2, v1]] of Object.entries(esperado)) {
    const r = calcular({ ...caso, probabilidade: prob }, config, base).publico;
    assert.strictEqual(r.doisLevantamentos.veredito, v2, `${prob} 2 lev`);
    assert.strictEqual(r.umLevantamento.veredito, v1, `${prob} 1 lev`);
  }
});

test('TIR da Senior fica entre o CDI do período e o Passivo, e é menor que a Sub quando há folga', () => {
  const i = calcular(caso, config, base).interno;
  perto(i.doisLevantamentos.seniorTirAm, 0.01039, 1e-4);
  perto(i.umLevantamento.seniorTirAm, 0.00989, 1e-4);
  assert.ok(i.doisLevantamentos.seniorTirAm < i.doisLevantamentos.passivoTirAm);
  assert.ok(i.doisLevantamentos.subTirAm > i.doisLevantamentos.seniorTirAm);
});

test('prazo fora da curva gera erro controlado', () => {
  assert.throws(() => calcular({ ...caso, mesesTotal: 400 }, config, base), /fora da curva/);
});
