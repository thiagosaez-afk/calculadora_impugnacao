'use strict';
const $ = (id) => document.getElementById(id);

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TEXTO = { vale: 'Vale contestar', limitrofe: 'Limítrofe', nao_vale: 'Não vale contestar' };

// Aceita "324.612,67", "324612,67" e "324612.67". Retorna NaN se não entender.
function lerValor(txt) {
  let s = String(txt).trim().replace(/\s|R\$/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

async function chamar(url, corpo) {
  const r = await fetch(url, {
    method: corpo ? 'POST' : 'GET',
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
    credentials: 'same-origin',
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

function mostrar(tela) {
  $('telaLogin').hidden = tela !== 'login';
  $('telaCalc').hidden = tela !== 'calc';
  $('sessao').hidden = tela !== 'calc';
}

async function iniciar() {
  const eu = await chamar('/api/eu');
  if (eu.status !== 200) return mostrar('login');
  $('usuario').textContent = eu.email;
  $('linkAdmin').hidden = eu.papel !== 'admin';
  for (const id of ['c6_prob', 'c12_prob']) {
    $(id).replaceChildren(...eu.probabilidades.map((p) => new Option(p, p)));
    $(id).value = 'Possível';
  }
  mostrar('calc');
}

$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('erroLogin').textContent = '';
  const r = await chamar('/api/login', { email: $('email').value, senha: $('senha').value });
  if (r.status !== 200) { $('erroLogin').textContent = r.erro || 'Não foi possível entrar.'; return; }
  $('senha').value = '';
  iniciar();
});

$('sair').addEventListener('click', async () => {
  await chamar('/api/logout', {});
  $('resultado').hidden = true;
  mostrar('login');
});

function linhas(dl, pares) {
  dl.replaceChildren();
  for (const [k, v] of pares) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
}

function cartao(i, c, rotuloRecebimento) {
  const el = $(`selo${i}`);
  el.textContent = TEXTO[c.veredito];
  el.className = `selo ${c.veredito}`;
  linhas($(`dl${i}`), [
    ['TIR do ativo', c.tirAtivoAm === null ? 'n/d' : `${pct.format(c.tirAtivoAm)} a.m.`],
    [`${rotuloRecebimento} no mês ${c.mes}`, brl.format(c.recebimento)],
  ]);
}

$('formCalc').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('erroCalc').textContent = '';
  const corpo = {
    proposta: $('proposta').value,
    incontroverso: lerValor($('incontroverso').value),
    atualizado: lerValor($('atualizado').value),
    naoImpugnar: { meses: Number($('n_meses').value) },
    receber6: { meses: Number($('c6_meses').value), totalEsperado: lerValor($('c6_total').value), probabilidade: $('c6_prob').value },
    receber12: { meses: Number($('c12_meses').value), totalEsperado: lerValor($('c12_total').value), probabilidade: $('c12_prob').value },
  };
  const r = await chamar('/api/calcular', corpo);
  if (r.status === 401) return mostrar('login');
  if (r.status !== 200) { $('erroCalc').textContent = r.erro || 'Verifique os campos.'; return; }

  $('eco').textContent = `Considerado: incontroverso ${brl2.format(corpo.incontroverso)}, atualizado ${brl2.format(corpo.atualizado)}.`;
  cartao(0, r.naoImpugnar, 'Recebimento do incontroverso');
  cartao(1, r.receber6, 'Recebimento esperado');
  cartao(2, r.receber12, 'Recebimento esperado');
  $('resultado').hidden = false;
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

iniciar();
