'use strict';
// Garante que a versão do navegador (docs/) dá o mesmo resultado do motor do servidor e da planilha.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const docs = path.join(__dirname, '..', 'docs');
const temDocs = ['motor.js', 'validacao.js', 'parametros.json'].every((f) => fs.existsSync(path.join(docs, f)));

function carregar() {
  const ctx = { globalThis: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['motor.js', 'validacao.js']) vm.runInContext(fs.readFileSync(path.join(docs, f), 'utf8'), ctx);
  return { Motor: ctx.Motor, Validacao: ctx.Validacao, p: JSON.parse(fs.readFileSync(path.join(docs, 'parametros.json'), 'utf8')) };
}

const caso = {
  incontroverso: 324612.67, atualizado: 352091.51, mesesPrimeiro: 1, mesesControverso: 12, mesesTotal: 14,
  totalEmN: 400622.5673993771, totalEmT: 414109.7317573213, probabilidade: 'Certo',
};

(temDocs ? test : test.skip)('motor do navegador reproduz a planilha', () => {
  const { Motor, p } = carregar();
  const r = Motor.calcular(caso, p.config, p.base);
  assert.ok(Math.abs(r.publico.doisLevantamentos.tirAtivoAm - 0.03820546392980351) < 1e-9);
  assert.ok(Math.abs(r.publico.umLevantamento.tirAtivoAm - 0.011651383527937265) < 1e-9);
  assert.ok(Math.abs(r.interno.doisLevantamentos.subTirAm - 0.05626310417876157) < 1e-9);
  assert.strictEqual(r.publico.doisLevantamentos.veredito, 'vale');
});

(temDocs ? test : test.skip)('parametros.json não carrega limites do servidor', () => {
  const { p } = carregar();
  assert.ok(!('limites' in p.config));
});

(temDocs ? test : test.skip)('validação do navegador recusa incontroverso maior que o atualizado', () => {
  const { Validacao, p } = carregar();
  assert.throws(() => Validacao.validarEntrada({ ...caso, incontroverso: 999999 }, p.config.probabilidades), /não pode ser maior/);
});
