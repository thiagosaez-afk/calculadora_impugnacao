'use strict';
// Atualização quinzenal das curvas (versão GitHub Pages).
// Uso: node scripts/atualizar-curvas.js arquivo.txt AAAA-MM-DD
//   arquivo.txt = colunas Data, IPCA e CDI coladas da planilha (tabela completa)
// Valida, grava data/curvas.json (guardando backup) e regenera docs/. Depois: git add, commit e push.
const fs = require('node:fs');
const path = require('node:path');
const { lerCurva } = require('../src/curvas');

const [arquivo, dataBase] = process.argv.slice(2);
if (!arquivo || !/^\d{4}-\d{2}-\d{2}$/.test(dataBase || '')) {
  console.error('Uso: node scripts/atualizar-curvas.js arquivo.txt AAAA-MM-DD');
  process.exit(1);
}
const dir = path.join(__dirname, '..', 'data');
const alvo = path.join(dir, 'curvas.json');
const curvas = lerCurva(fs.readFileSync(arquivo, 'utf8'), dataBase);
if (fs.existsSync(alvo)) {
  fs.mkdirSync(path.join(dir, 'backup'), { recursive: true });
  fs.copyFileSync(alvo, path.join(dir, 'backup', `curvas-${Date.now()}.json`));
}
fs.writeFileSync(alvo, JSON.stringify({ dataBase, atualizadoEm: new Date().toISOString().slice(0, 10), curvas }));
console.log(`Curva validada: ${curvas.length} meses, até ${curvas[curvas.length - 1].d}.`);
require('./gerar-docs');
