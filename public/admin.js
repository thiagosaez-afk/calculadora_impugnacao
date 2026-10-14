'use strict';
const $ = (id) => document.getElementById(id);

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

async function estado() {
  const r = await chamar('/api/admin/curvas');
  if (r.status !== 200) { $('negado').hidden = false; return; }
  $('painel').hidden = false;
  $('estado').textContent = r.dataBase
    ? `Curva atual: data-base ${r.dataBase}, ${r.linhas} meses, até ${r.ultimaData}, atualizada em ${r.atualizadoEm}.`
    : 'Nenhuma curva publicada ainda. A calculadora só funciona depois da primeira publicação.';
  usuarios();
}

async function usuarios() {
  const r = await chamar('/api/admin/usuarios');
  if (r.status !== 200) return;
  $('painelUsuarios').hidden = false;
  const ul = $('listaUsuarios');
  ul.replaceChildren();
  for (const u of r.usuarios) {
    const li = document.createElement('li');
    li.textContent = `${u.email} (${u.papel}) `;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'link'; b.textContent = 'remover';
    b.addEventListener('click', async () => {
      if (!confirm(`Remover o acesso de ${u.email}?`)) return;
      const x = await chamar('/api/admin/usuarios/remover', { email: u.email });
      $('msgUsuario').className = x.status === 200 ? 'ok' : 'erro';
      $('msgUsuario').textContent = x.status === 200 ? 'Acesso removido.' : x.erro;
      usuarios();
    });
    li.append(b);
    ul.append(li);
  }
}

$('formUsuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await chamar('/api/admin/usuarios', { email: $('novoEmail').value, papel: $('novoPapel').value });
  $('msgUsuario').className = r.status === 200 ? 'ok' : 'erro';
  $('msgUsuario').textContent = r.status === 200 ? `Usuário ${r.email}. Senha provisória: ${r.senha}` : r.erro;
  if (r.status === 200) { $('novoEmail').value = ''; usuarios(); }
});

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('msg').textContent = '';
  const r = await chamar('/api/admin/curvas', { dataBase: $('dataBase').value.trim(), texto: $('texto').value });
  $('msg').className = r.status === 200 ? 'ok' : 'erro';
  $('msg').textContent = r.status === 200 ? `Publicada: ${r.linhas} meses, até ${r.ultimaData}.` : r.erro || 'Falha ao publicar.';
  if (r.status === 200) { $('texto').value = ''; estado(); }
});

estado();
