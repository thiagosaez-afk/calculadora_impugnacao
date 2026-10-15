'use strict';
// Versão GitHub Pages: o cálculo roda no navegador, com os parâmetros de parametros.json (públicos).
const $ = (id) => document.getElementById(id);

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TEXTO = { vale: 'Vale contestar', limitrofe: 'Limítrofe', nao_vale: 'Não vale contestar' };

let parametros = null;

// Aceita "324.612,67", "324612,67" e "324612.67". Retorna NaN se não entender.
function lerValor(txt) {
  let s = String(txt).trim().replace(/\s|R\$/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

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

async function iniciar() {
  try {
    const r = await fetch('parametros.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('parametros');
    parametros = await r.json();
  } catch {
    $('erroCalc').textContent = 'Não foi possível carregar os parâmetros. Recarregue a página.';
    return;
  }
  const sel = $('probabilidade');
  sel.replaceChildren(...Object.keys(parametros.config.probabilidades).map((p) => new Option(p, p)));
  sel.value = 'Possível';
  const [a, m, d] = parametros.base.dataBase.split('-');
  $('rodape').textContent = `Curvas de CDI e IPCA com data-base ${d}/${m}/${a}.`;
  $('calcular').disabled = false;
}

$('formCalc').addEventListener('submit', (e) => {
  e.preventDefault();
  $('erroCalc').textContent = '';
  if (!parametros) return;
  const corpo = {
    incontroverso: lerValor($('incontroverso').value),
    atualizado: lerValor($('atualizado').value),
    mesesPrimeiro: Number($('mesesPrimeiro').value),
    mesesControverso: Number($('mesesControverso').value),
    mesesTotal: Number($('mesesTotal').value),
    totalEmN: lerValor($('totalEmN').value),
    totalEmT: lerValor($('totalEmT').value),
    probabilidade: $('probabilidade').value,
  };
  let r;
  try {
    const entrada = Validacao.validarEntrada(corpo, parametros.config.probabilidades);
    r = Validacao.arredondar(Motor.calcular(entrada, parametros.config, parametros.base).publico);
  } catch (err) {
    $('erroCalc').textContent = err.message || 'Verifique os campos.';
    return;
  }
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
