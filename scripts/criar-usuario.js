'use strict';
// Uso: node scripts/criar-usuario.js email@escritorio.com.br [admin|parceiro]
// Gera uma senha aleatória, grava o hash em data/users.json e imprime a senha uma única vez.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { criarRegistro } = require('../src/auth');

const [email, papel = 'parceiro'] = process.argv.slice(2);
if (!email || !['admin', 'parceiro'].includes(papel)) {
  console.error('Uso: node scripts/criar-usuario.js email [admin|parceiro]');
  process.exit(1);
}
const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const arq = path.join(dir, 'users.json');
const dados = fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, 'utf8')) : { users: [] };
const senha = crypto.randomBytes(9).toString('base64url');
const reg = criarRegistro(email, senha, papel);
dados.users = dados.users.filter((u) => u.email !== reg.email).concat(reg);
fs.writeFileSync(arq, JSON.stringify(dados, null, 2));
console.log(`Usuário ${reg.email} (${papel}) gravado.\nSenha provisória: ${senha}`);
