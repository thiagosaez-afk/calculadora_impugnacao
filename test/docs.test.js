'use strict';
// Garante que a versão do navegador (docs/) dá o mesmo resultado do motor do servidor.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { calcular } = require('../src/engine');

const docs = path.join(__dirname, '..', 'docs');
const temDocs = ['motor.js', 'validacao.js', 'parametros.json'].every((f) => fs.existsSync(path.join(docs, f)));

function carregar() {
  const ctx = {};
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['motor.js', 'validacao.js']) vm.runInContext(fs.readFileSync(path.join(docs, f), 'utf8'), ctx);
  return { Motor: ctx.Motor, Validacao: ctx.Validacao, p: JSON.parse(fs.readFileSync(path.join(docs, 'parametros.json'), 'utf8')) };
}

const caso = {
  incontroverso: 324612.67,
  atualizado: 352091.51,
  naoImpugnar: { meses: 1 },
  receber6: { meses: 6, totalEsperado: 380000, probabilidade: 'Provável' },
  receber12: { meses: 12, totalEsperado: 400622.57, probabilidade: 'Certo' },
};

(temDocs ? test : test.skip)('motor do navegador dá o mesmo resultado do motor do servidor', () => {
  const { Motor, p } = carregar();
  const navegador = Motor.calcular(caso, p.config, p.base);
  const servidor = calcular(caso, p.config, p.base);
  for (const c of ['naoImpugnar', 'receber6', 'receber12']) {
    assert.strictEqual(navegador.publico[c].veredito, servidor.publico[c].veredito, c);
    assert.ok(Math.abs(navegador.publico[c].recebimento - servidor.publico[c].recebimento) < 1e-6, c);
    assert.ok(Math.abs(navegador.interno[c].subTirAm - servidor.interno[c].subTirAm) < 1e-9, c);
  }
});

(temDocs ? test : test.skip)('parametros.json não carrega limites do servidor', () => {
  const { p } = carregar();
  assert.ok(!('limites' in p.config));
});

(temDocs ? test : test.skip)('validação do navegador recusa incontroverso maior que o atualizado', () => {
  const { Validacao, p } = carregar();
  assert.throws(() => Validacao.validarEntrada({ ...caso, incontroverso: 999999 }, p.config.probabilidades), /não pode ser maior/);
});
