'use strict';
// Servidor HTTP sem dependências externas. Toda a conta e todos os parâmetros ficam aqui.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { calcular, ErroCalculo } = require('./src/engine');
const { Auth } = require('./src/auth');
const { lerCurva } = require('./src/curvas');
const { validarEntrada, arredondar } = require('./src/validacao');

const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'logs');

// Config (spreads, proporções) e curvas não vão no repositório: vêm de arquivo secreto e do disco.
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(DATA_DIR, 'config.json');
const CURVAS_FILE = path.join(DATA_DIR, 'curvas.json');
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
let base = fs.existsSync(CURVAS_FILE) ? JSON.parse(fs.readFileSync(CURVAS_FILE, 'utf8')) : null;
const auth = new Auth(DATA_DIR, config.limites);
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

// Primeiro acesso: se não há usuários e ADMIN_EMAIL está definido, cria o admin e imprime a senha uma vez no log.
if (process.env.ADMIN_EMAIL && auth.usuarios().length === 0) {
  const r = auth.criarOuRedefinir(process.env.ADMIN_EMAIL, 'admin');
  console.log(`Admin inicial criado: ${r.email}. Senha provisória: ${r.senha} (apague este log depois de anotar).`);
}

const ESTATICOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/admin': ['admin.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/admin.js': ['admin.js', 'text/javascript; charset=utf-8'],
  '/estilo.css': ['estilo.css', 'text/css; charset=utf-8'],
};

const CABECALHOS = {
  'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function json(res, status, corpo) {
  res.writeHead(status, { ...CABECALHOS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req, limite = 300000) {
  return new Promise((resolve, reject) => {
    let tam = 0;
    const partes = [];
    req.on('data', (c) => {
      tam += c.length;
      if (tam > limite) { reject(new Error('Corpo grande demais.')); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

function cookie(req, nome) {
  const m = (req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(nome + '='));
  return m ? m.slice(nome.length + 1) : null;
}

function registrar(evento) {
  fs.appendFile(path.join(LOG_DIR, 'uso.jsonl'), JSON.stringify({ t: new Date().toISOString(), ...evento }) + '\n', () => {});
}

const ip = (req) => req.socket.remoteAddress || '';

function origemOk(req) {
  const o = req.headers.origin;
  return !o || new URL(o).host === req.headers.host;
}

async function api(req, res, url) {
  if (req.method === 'POST' && !origemOk(req)) return json(res, 403, { erro: 'Origem não permitida.' });
  const token = cookie(req, 'sid');
  const sessao = token ? auth.sessao(token) : null;

  if (url === '/api/login' && req.method === 'POST') {
    const b = await lerCorpo(req, 5000);
    const r = auth.login(b.email, b.senha, ip(req));
    if (r.erro === 'bloqueado') return json(res, 429, { erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    if (r.erro) { registrar({ evento: 'login_falhou', email: String(b.email).slice(0, 80), ip: ip(req) }); return json(res, 401, { erro: 'E-mail ou senha incorretos.' }); }
    const flags = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${config.limites.sessaoHoras * 3600}${PROD ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', `sid=${r.token}; ${flags}`);
    registrar({ evento: 'login', email: String(b.email).toLowerCase() });
    return json(res, 200, { ok: true });
  }

  if (url === '/api/logout' && req.method === 'POST') {
    if (token) auth.logout(token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  if (!sessao) return json(res, 401, { erro: 'Sessão expirada.' });

  if (url === '/api/eu' && req.method === 'GET') {
    return json(res, 200, { email: sessao.email, papel: sessao.papel, probabilidades: Object.keys(config.probabilidades) });
  }

  if (url === '/api/calcular' && req.method === 'POST') {
    if (!base) return json(res, 503, { erro: 'Calculadora em atualização. Tente novamente em instantes.' });
    if (!auth.podeCalcular(sessao.email)) return json(res, 429, { erro: 'Limite de consultas por hora atingido.' });
    let entrada;
    try {
      const b = await lerCorpo(req, 5000);
      entrada = validarEntrada(b, config.probabilidades);
      const r = calcular(entrada, config, base);
      const pub = arredondar(r.publico);
      registrar({ evento: 'calculo', email: sessao.email, proposta: String(b.proposta || '').slice(0, 40), entrada, veredito: { naoImpugnar: pub.naoImpugnar.veredito, receber6: pub.receber6.veredito, receber12: pub.receber12.veredito } });
      return json(res, 200, { ...pub, dataBase: base.dataBase });
    } catch (e) {
      if (e instanceof ErroCalculo || /deve ser|não pode|deve vir|inválid/.test(e.message)) return json(res, 400, { erro: e.message });
      registrar({ evento: 'erro', email: sessao.email, msg: e.message });
      return json(res, 500, { erro: 'Não foi possível calcular.' });
    }
  }

  if (url.startsWith('/api/admin/')) {
    if (sessao.papel !== 'admin') return json(res, 403, { erro: 'Acesso restrito.' });
    if (url === '/api/admin/curvas' && req.method === 'GET') {
      if (!base) return json(res, 200, { dataBase: null, linhas: 0 });
      return json(res, 200, { dataBase: base.dataBase, atualizadoEm: base.atualizadoEm, linhas: base.curvas.length, ultimaData: base.curvas[base.curvas.length - 1].d });
    }
    if (url === '/api/admin/usuarios' && req.method === 'GET') return json(res, 200, { usuarios: auth.listar() });
    if (url === '/api/admin/usuarios' && req.method === 'POST') {
      try {
        const b = await lerCorpo(req, 2000);
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
        if (!['admin', 'parceiro'].includes(b.papel)) throw new Error('Papel inválido.');
        const r = auth.criarOuRedefinir(email, b.papel);
        registrar({ evento: 'usuario_criado', por: sessao.email, email: r.email, papel: b.papel });
        return json(res, 200, r);
      } catch (e) { return json(res, 400, { erro: e.message }); }
    }
    if (url === '/api/admin/usuarios/remover' && req.method === 'POST') {
      try {
        const b = await lerCorpo(req, 2000);
        if (String(b.email).trim().toLowerCase() === sessao.email) throw new Error('Você não pode remover o próprio acesso.');
        auth.remover(b.email);
        registrar({ evento: 'usuario_removido', por: sessao.email, email: String(b.email).slice(0, 80) });
        return json(res, 200, { ok: true });
      } catch (e) { return json(res, 400, { erro: e.message }); }
    }
    if (url === '/api/admin/curvas' && req.method === 'POST') {
      try {
        const b = await lerCorpo(req, 300000);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.dataBase))) throw new Error('Data-base deve estar no formato AAAA-MM-DD.');
        const curvas = lerCurva(b.texto, b.dataBase);
        const novo = { dataBase: b.dataBase, atualizadoEm: new Date().toISOString().slice(0, 10), curvas };
        // Calcula um caso de teste antes de publicar, para não aceitar curva que quebra o motor
        calcular({
          incontroverso: 100000, atualizado: 120000,
          naoImpugnar: { meses: 1 },
          receber6: { meses: 6, totalEsperado: 125000, probabilidade: 'Certo' },
          receber12: { meses: 12, totalEsperado: 130000, probabilidade: 'Certo' },
        }, config, novo);
        if (fs.existsSync(CURVAS_FILE)) {
          const bak = path.join(DATA_DIR, 'backup');
          fs.mkdirSync(bak, { recursive: true });
          fs.copyFileSync(CURVAS_FILE, path.join(bak, `curvas-${Date.now()}.json`));
        }
        const tmp = CURVAS_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(novo));
        fs.renameSync(tmp, CURVAS_FILE);
        base = novo;
        registrar({ evento: 'curvas_atualizadas', email: sessao.email, dataBase: b.dataBase, linhas: curvas.length });
        return json(res, 200, { ok: true, linhas: curvas.length, ultimaData: curvas[curvas.length - 1].d });
      } catch (e) {
        return json(res, 400, { erro: e.message });
      }
    }
  }
  return json(res, 404, { erro: 'Não encontrado.' });
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x').pathname;
    if (url === '/saude') return json(res, 200, { ok: true });
    if (url.startsWith('/api/')) return await api(req, res, url);
    const est = ESTATICOS[url];
    if (req.method !== 'GET' || !est) { res.writeHead(404, CABECALHOS); return res.end('Não encontrado'); }
    res.writeHead(200, { ...CABECALHOS, 'Content-Type': est[1], 'Cache-Control': 'no-cache' });
    fs.createReadStream(path.join(PUBLIC, est[0])).pipe(res);
  } catch (e) {
    json(res, 500, { erro: 'Erro interno.' });
  }
});

servidor.listen(PORT, () => console.log(`Calculadora rodando na porta ${PORT}`));
