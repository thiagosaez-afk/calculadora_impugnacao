'use strict';
// Usuários, sessões em memória, limite de tentativas de login e limite de cálculos por hora.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function hashSenha(senha, salt) {
  return crypto.scryptSync(senha, salt, 64).toString('hex');
}

function criarRegistro(email, senha, papel) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { email: email.trim().toLowerCase(), salt, hash: hashSenha(senha, salt), papel };
}

class Auth {
  constructor(dataDir, limites) {
    this.arquivo = path.join(dataDir, 'users.json');
    this.limites = limites;
    this.sessoes = new Map(); // token -> {email, papel, expira}
    this.tentativas = new Map(); // chave -> [timestamps]
    this.calculos = new Map(); // email -> [timestamps]
  }

  usuarios() {
    try {
      return JSON.parse(fs.readFileSync(this.arquivo, 'utf8')).users;
    } catch {
      return [];
    }
  }

  listar() {
    return this.usuarios().map((u) => ({ email: u.email, papel: u.papel }));
  }

  // Cria ou redefine o usuário. Retorna a senha provisória, que só aparece nesta chamada.
  criarOuRedefinir(email, papel) {
    const senha = crypto.randomBytes(9).toString('base64url');
    const reg = criarRegistro(email, senha, papel);
    const lista = this.usuarios().filter((u) => u.email !== reg.email).concat(reg);
    fs.writeFileSync(this.arquivo, JSON.stringify({ users: lista }, null, 2));
    this.encerrarSessoes(reg.email);
    return { email: reg.email, senha };
  }

  remover(email) {
    const alvo = String(email).trim().toLowerCase();
    const lista = this.usuarios().filter((u) => u.email !== alvo);
    fs.writeFileSync(this.arquivo, JSON.stringify({ users: lista }, null, 2));
    this.encerrarSessoes(alvo);
  }

  encerrarSessoes(email) {
    for (const [t, s] of this.sessoes) if (s.email === email) this.sessoes.delete(t);
  }

  bloqueado(chave) {
    const janela = this.limites.janelaLoginMin * 60000;
    const agora = Date.now();
    const lista = (this.tentativas.get(chave) || []).filter((t) => agora - t < janela);
    this.tentativas.set(chave, lista);
    return lista.length >= this.limites.tentativasLogin;
  }

  login(email, senha, ip) {
    // Chave só pelo e-mail: atrás do proxy da nuvem o IP do cliente não é confiável
    const chave = String(email).trim().toLowerCase();
    if (this.bloqueado(chave)) return { erro: 'bloqueado' };
    const u = this.usuarios().find((x) => x.email === String(email).trim().toLowerCase());
    // Faz o hash mesmo sem usuário, para não revelar por tempo de resposta quais e-mails existem
    const salt = u ? u.salt : '00'.repeat(16);
    const h = Buffer.from(hashSenha(String(senha), salt), 'hex');
    const esperado = Buffer.from(u ? u.hash : '00'.repeat(64), 'hex');
    const ok = u && crypto.timingSafeEqual(h, esperado);
    if (!ok) {
      this.tentativas.get(chave).push(Date.now());
      return { erro: 'invalido' };
    }
    const token = crypto.randomBytes(32).toString('hex');
    this.sessoes.set(token, {
      email: u.email,
      papel: u.papel,
      expira: Date.now() + this.limites.sessaoHoras * 3600000,
    });
    return { token };
  }

  sessao(token) {
    const s = this.sessoes.get(token);
    if (!s) return null;
    if (s.expira < Date.now()) {
      this.sessoes.delete(token);
      return null;
    }
    return s;
  }

  logout(token) {
    this.sessoes.delete(token);
  }

  // true se ainda pode calcular; registra o uso
  podeCalcular(email) {
    const agora = Date.now();
    const lista = (this.calculos.get(email) || []).filter((t) => agora - t < 3600000);
    if (lista.length >= this.limites.calculosPorHora) {
      this.calculos.set(email, lista);
      return false;
    }
    lista.push(agora);
    this.calculos.set(email, lista);
    return true;
  }
}

module.exports = { Auth, criarRegistro };
