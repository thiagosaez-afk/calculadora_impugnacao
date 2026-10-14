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
  const sel = $('probabilidade');
  sel.replaceChildren(...eu.probabilidades.map((p) => new Option(p, p)));
  sel.value = 'Possível';
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

function selo(el, veredito) {
  el.textContent = TEXTO[veredito];
  el.className = `selo ${veredito}`;
}

$('formCalc').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('erroCalc').textContent = '';
  const corpo = {
    proposta: $('proposta').value,
    incontroverso: lerValor($('incontroverso').value),
    atualizado: lerValor($('atualizado').value),
    mesesPrimeiro: Number($('mesesPrimeiro').value),
    mesesControverso: Number($('mesesControverso').value),
    mesesTotal: Number($('mesesTotal').value),
    totalEmN: lerValor($('totalEmN').value),
    totalEmT: lerValor($('totalEmT').value),
    probabilidade: $('probabilidade').value,
  };
  const r = await chamar('/api/calcular', corpo);
  if (r.status === 401) return mostrar('login');
  if (r.status !== 200) { $('erroCalc').textContent = r.erro || 'Verifique os campos.'; return; }

  $('eco').textContent = `Considerado: incontroverso ${brl2.format(corpo.incontroverso)}, atualizado ${brl2.format(corpo.atualizado)}, probabilidade ${corpo.probabilidade}.`;
  const d = r.doisLevantamentos;
  const u = r.umLevantamento;
  selo($('selo2'), d.veredito);
  selo($('selo1'), u.veredito);
  linhas($('dl2'), [
    ['TIR do ativo', d.tirAtivoAm === null ? 'n/d' : `${pct.format(d.tirAtivoAm)} a.m.`],
    [`Recebimento no mês ${d.mesIncontroverso}`, brl.format(d.recebimentoIncontroverso)],
    [`Controverso esperado no mês ${d.mesControverso}`, brl.format(d.controversoEsperado)],
  ]);
  linhas($('dl1'), [
    ['TIR do ativo', u.tirAtivoAm === null ? 'n/d' : `${pct.format(u.tirAtivoAm)} a.m.`],
    [`Recebimento esperado no mês ${u.mesTotal}`, brl.format(u.recebimentoTotalEsperado)],
  ]);
  $('resultado').hidden = false;
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

iniciar();
