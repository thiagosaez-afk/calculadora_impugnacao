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

function cartao(i, c, rotuloRecebimento) {
  const el = $(`selo${i}`);
  el.textContent = TEXTO[c.veredito];
  el.className = `selo ${c.veredito}`;
  linhas($(`dl${i}`), [
    ['TIR do ativo', c.tirAtivoAm === null ? 'n/d' : `${pct.format(c.tirAtivoAm)} a.m.`],
    [`${rotuloRecebimento} no mês ${c.mes}`, brl.format(c.recebimento)],
  ]);
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
  const chaves = Object.keys(parametros.config.probabilidades);
  for (const id of ['c6_prob', 'c12_prob']) {
    $(id).replaceChildren(...chaves.map((p) => new Option(p, p)));
    $(id).value = 'Possível';
  }
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
    naoImpugnar: { meses: Number($('n_meses').value) },
    receber6: { meses: Number($('c6_meses').value), totalEsperado: lerValor($('c6_total').value), probabilidade: $('c6_prob').value },
    receber12: { meses: Number($('c12_meses').value), totalEsperado: lerValor($('c12_total').value), probabilidade: $('c12_prob').value },
  };
  let r;
  try {
    const entrada = Validacao.validarEntrada(corpo, parametros.config.probabilidades);
    r = Validacao.arredondar(Motor.calcular(entrada, parametros.config, parametros.base).publico);
  } catch (err) {
    $('erroCalc').textContent = err.message || 'Verifique os campos.';
    return;
  }
  $('eco').textContent = `Considerado: incontroverso ${brl2.format(corpo.incontroverso)}, atualizado ${brl2.format(corpo.atualizado)}.`;
  cartao(0, r.naoImpugnar, 'Recebimento do incontroverso');
  cartao(1, r.receber6, 'Recebimento esperado');
  cartao(2, r.receber12, 'Recebimento esperado');
  $('resultado').hidden = false;
  $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

iniciar();
