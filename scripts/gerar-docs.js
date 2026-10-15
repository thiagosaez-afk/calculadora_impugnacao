'use strict';
// Gera os arquivos que o GitHub Pages serve (pasta docs/) a partir do código do servidor:
//   docs/motor.js       = src/engine.js embrulhado para o navegador
//   docs/validacao.js   = src/validacao.js embrulhado para o navegador
//   docs/parametros.json = data/config.json (sem os limites do servidor) + data/curvas.json
// ATENÇÃO: tudo o que vai para docs/ fica PÚBLICO na internet, inclusive os parâmetros reais.
// Uso: node scripts/gerar-docs.js
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const docs = path.join(raiz, 'docs');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

function embrulhar(nome, origem) {
  const codigo = ler(origem).replace(/^'use strict';\s*/, '');
  return `'use strict';\n// ARQUIVO GERADO por scripts/gerar-docs.js a partir de ${origem}. Não editar aqui.\n(function () {\nvar module = { exports: {} };\n${codigo}\nglobalThis.${nome} = module.exports;\n})();\n`;
}

fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(path.join(docs, 'motor.js'), embrulhar('Motor', 'src/engine.js'));
fs.writeFileSync(path.join(docs, 'validacao.js'), embrulhar('Validacao', 'src/validacao.js'));

const { limites, ...config } = JSON.parse(ler('data/config.json'));
const base = JSON.parse(ler('data/curvas.json'));
fs.writeFileSync(path.join(docs, 'parametros.json'), JSON.stringify({ config, base }));
console.log(`docs/ gerado. Data-base das curvas: ${base.dataBase}, ${base.curvas.length} meses.`);
