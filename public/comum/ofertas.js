// Comportamento das páginas de oferta: revelar ao rolar, botão fixo no celular e formulário em passos.
// Sem JS a página continua inteira: o formulário aparece com todos os passos à vista.
(() => {
  const CONFIG = {
    // PENDENTE: função de lead endurecida (Zod, anti-spam, aba "Anúncios" do comercial). Vazio = modo teste, nada sai da página.
    endpoint: '',
    // WhatsApp do comercial (Matheus), só dígitos com DDI. Passado pelo JV em 04/11/2026.
    whatsapp: '5531995194872',
  };

  // Cada anúncio abre a página com ?p=<produto>: o rótulo do herói repete o anúncio e o produto já vem marcado no formulário.
  const ROTULOS = {
    lp: 'Página de oferta com 35% off na Black Friday',
    site: 'Site com 35% off na Black Friday',
    loja: 'Loja completa com 35% off na Black Friday',
    motion: 'Vídeos em motion com 35% off na Black Friday',
  };

  const pagina = document.body;
  const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Quem pediu menos movimento não recebe vídeo tocando sozinho.
  if (reduzido) document.querySelectorAll('video[autoplay]').forEach((v) => { v.removeAttribute('autoplay'); v.pause(); });
  const rastrear = (evento, dados, id) => {
    if (typeof window.fbq === 'function') window.fbq('track', evento, dados || {}, id ? { eventID: id } : undefined);
  };

  // Só um motion toca por vez: dar play num pausa os outros.
  const motions = [...document.querySelectorAll('video[controls]')];
  motions.forEach((v) => v.addEventListener('play', () => motions.forEach((outro) => { if (outro !== v) outro.pause(); })));

  // Trabalhos rolando dentro da moldura: a duração vem do tamanho da página, e só anda enquanto está na tela.
  const rolaveis = [...document.querySelectorAll('.rolavel')];
  const ajustarDuracao = (img) => {
    const moldura = img.parentElement;
    const curso = (img.naturalHeight / img.naturalWidth) * moldura.clientWidth - moldura.clientHeight;
    img.style.setProperty('--dur', `${Math.min(36, Math.max(8, curso / 60))}s`);
  };
  rolaveis.forEach((img) => { if (img.complete && img.naturalWidth) ajustarDuracao(img); else img.addEventListener('load', () => ajustarDuracao(img), { once: true }); });
  if (rolaveis.length && !reduzido && 'IntersectionObserver' in window) {
    // Observa a moldura, não a imagem: a imagem é muito mais alta que a janela dela e nunca chegaria a 20% visível.
    const olhar = new IntersectionObserver((entradas) => entradas.forEach((e) => e.target.querySelector('.rolavel').classList.toggle('rolando', e.isIntersecting)), { threshold: .2 });
    rolaveis.forEach((img) => olhar.observe(img.parentElement));
  }

  // Revelar ao rolar
  const revelaveis = document.querySelectorAll('.revela');
  if ('IntersectionObserver' in window) {
    const olho = new IntersectionObserver((itens) => {
      for (const item of itens) {
        if (!item.isIntersecting) continue;
        item.target.classList.add('visivel');
        olho.unobserve(item.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revelaveis.forEach((el) => olho.observe(el));
  } else {
    revelaveis.forEach((el) => el.classList.add('visivel'));
  }

  // Botão fixo no celular: aparece quando o herói sai da tela e some quando o formulário entra.
  const fixo = document.querySelector('.cta-fixo');
  const heroi = document.querySelector('.heroi');
  const secaoForm = document.querySelector('#comecar');
  if (fixo && heroi && secaoForm && 'IntersectionObserver' in window) {
    let heroiVisivel = true;
    let formVisivel = false;
    const atualizar = () => fixo.classList.toggle('ativo', !heroiVisivel && !formVisivel);
    new IntersectionObserver(([e]) => { heroiVisivel = e.isIntersecting; atualizar(); }).observe(heroi);
    new IntersectionObserver(([e]) => { formVisivel = e.isIntersecting; atualizar(); }, { rootMargin: '0px 0px -30% 0px' }).observe(secaoForm);
  }

  // Formulário em passos
  const form = document.querySelector('#form-lead');
  if (!form) return;
  const passos = [...form.querySelectorAll('.passo')];
  const textoProgresso = form.querySelector('.progresso span');
  const barra = form.querySelector('.progresso-trilho i');
  const obrigado = document.querySelector('.obrigado');
  let atual = 0;

  const mostrar = (indice, focar = true) => {
    indice = Math.min(indice, passos.length - 1);
    atual = indice;
    passos.forEach((p, i) => p.classList.toggle('ativo', i === indice));
    textoProgresso.textContent = `Passo ${indice + 1} de ${passos.length}`;
    barra.style.transform = `scaleX(${(indice + 1) / passos.length})`;
    if (!focar) return;
    const topo = form.getBoundingClientRect().top;
    if (topo < 0 || topo > window.innerHeight * 0.6) form.scrollIntoView({ block: 'start', behavior: reduzido ? 'auto' : 'smooth' });
    const primeiro = passos[indice].querySelector('input:not([type=radio]), input[type=radio]');
    if (primeiro) primeiro.focus({ preventScroll: true });
  };

  const digitos = (v) => v.replace(/\D/g, '');
  const telefone = form.querySelector('input[name=whatsapp]');
  telefone.addEventListener('input', () => {
    const d = digitos(telefone.value).slice(0, 11);
    let v = d;
    if (d.length > 2) v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) v = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    telefone.value = v;
  });

  const validar = (passo) => {
    const erro = passo.querySelector('.erro');
    let mensagem = '';
    passo.querySelectorAll('input[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
    const grupo = passo.querySelector('[data-grupo]');
    if (grupo && !grupo.querySelector('input:checked')) mensagem = 'Marca pelo menos uma opção pra continuar.';
    for (const campo of passo.querySelectorAll('input[required]')) {
      if (campo.type === 'radio') {
        if (!passo.querySelector(`input[name="${campo.name}"]:checked`)) { mensagem = 'Escolhe uma opção pra continuar.'; break; }
        continue;
      }
      const valor = campo.value.trim();
      if (campo.name === 'whatsapp') {
        const n = digitos(valor).length;
        if (n < 10 || n > 11) { mensagem = 'Confere o WhatsApp com DDD. Ex.: (11) 99999-8888.'; campo.setAttribute('aria-invalid', 'true'); campo.focus(); break; }
      } else if (valor.length < 2) {
        mensagem = campo.dataset.erro || 'Preenche esse campo pra continuar.'; campo.setAttribute('aria-invalid', 'true'); campo.focus(); break;
      }
    }
    erro.textContent = mensagem;
    return !mensagem;
  };

  form.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-acao]');
    if (!botao) return;
    if (botao.dataset.acao === 'avancar' && validar(passos[atual])) mostrar(atual + 1);
    if (botao.dataset.acao === 'voltar' && atual > 0) mostrar(atual - 1);
  });

  // Enter num campo de texto avança em vez de enviar o formulário inteiro.
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || atual === passos.length - 1) return;
    e.preventDefault();
    if (validar(passos[atual])) mostrar(atual + 1);
  });

  // Tocar numa opção já leva ao próximo passo (menos um toque no celular).
  // Só com dedo ou mouse: no teclado, a seta troca de opção e não pode pular o passo.
  let porToque = false;
  form.addEventListener('pointerdown', (e) => { porToque = Boolean(e.target.closest('.opcao')); });
  form.addEventListener('change', (e) => {
    if (e.target.type !== 'radio' || atual === passos.length - 1 || !porToque) return;
    porToque = false;
    passos[atual].querySelector('.erro').textContent = '';
    // Só avança se a pessoa ainda estiver neste passo quando o timer disparar (toque + Continuar rápido avançava duas vezes).
    const de = atual;
    window.setTimeout(() => { if (atual === de) mostrar(de + 1); }, reduzido ? 0 : 220);
  });

  const escolhido = (nome) => [...form.querySelectorAll(`input[name="${nome}"]:checked`)]
    .map((campo) => campo.nextElementSibling.textContent.trim()).join(', ');

  // Produto marcado pelo anúncio (?p=) ou pelo botão do cartão (data-produto).
  const marcar = (produto) => {
    const caixa = form.querySelector(`input[name=produtos][value="${produto}"]`);
    if (caixa) caixa.checked = true;
  };
  const daUrl = new URLSearchParams(window.location.search).get('p');
  if (daUrl && ROTULOS[daUrl]) {
    marcar(daUrl);
    const rotulo = document.querySelector('[data-rotulo-heroi]');
    if (rotulo) rotulo.textContent = ROTULOS[daUrl];
  }
  document.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-produto]');
    if (botao) marcar(botao.dataset.produto);
  });

  const montarResumo = (dados) => [
    `Oi! Vim pela página "${pagina.dataset.ofertaNome}" da NODE e preenchi o formulário.`,
    '',
    `Nome: ${dados.nome}`,
    `Área: ${dados.area}`,
    `Quero: ${dados.produtos}`,
    `Maior dificuldade: ${dados.dificuldade}`,
    `Faturamento: ${dados.faturamento}`,
    `Quem decide: ${dados.decisor}`,
  ].join('\n');

  const concluir = (dados) => {
    form.hidden = true;
    obrigado.querySelector('[data-nome]').textContent = dados.nome.split(' ')[0];
    obrigado.querySelector('.resumo').innerHTML = '';
    for (const [rotulo, valor] of [['Área', dados.area], ['Quer', dados.produtos], ['Maior dificuldade', dados.dificuldade], ['Faturamento', dados.faturamento], ['Quem decide', dados.decisor]]) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = `${rotulo}: `;
      li.append(b, document.createTextNode(valor));
      obrigado.querySelector('.resumo').append(li);
    }
    const zap = obrigado.querySelector('[data-whatsapp]');
    if (CONFIG.whatsapp) {
      zap.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(montarResumo(dados))}`;
      zap.addEventListener('click', () => rastrear('Contact'));
    } else {
      zap.removeAttribute('href');
      zap.setAttribute('aria-disabled', 'true');
      zap.classList.add('pendente');
      zap.querySelector('span').textContent = 'WhatsApp do comercial a definir';
    }
    obrigado.classList.add('ativo');
    obrigado.querySelector('h3').focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validar(passos[atual])) return;
    const fd = new FormData(form);
    const url = new URL(window.location.href);
    const dados = {
      area: escolhido('area'),
      produtos: escolhido('produtos'),
      dificuldade: escolhido('dificuldade'),
      faturamento: escolhido('faturamento'),
      decisor: escolhido('decisor'),
      nome: String(fd.get('nome') || '').trim(),
      whatsapp: digitos(String(fd.get('whatsapp') || '')),
      oferta: pagina.dataset.oferta,
      pagina: url.origin + url.pathname,
      event_id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
    };
    for (const chave of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid']) {
      if (url.searchParams.get(chave)) dados[chave] = url.searchParams.get(chave);
    }

    // Robô que preencheu o campo escondido vê a tela de obrigado e nada é gravado.
    if (String(fd.get('site_empresa') || '')) { concluir(dados); return; }

    const enviar = form.querySelector('button[type=submit]');
    const erro = passos[atual].querySelector('.erro');
    enviar.disabled = true;
    erro.textContent = '';
    try {
      if (CONFIG.endpoint) {
        const resposta = await fetch(CONFIG.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
          signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
        });
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      } else {
        console.info('[modo teste] lead não enviado:', dados);
      }
      rastrear('Lead', { content_name: dados.oferta }, dados.event_id);
      concluir(dados);
    } catch {
      erro.textContent = 'Não deu pra enviar agora. Tenta de novo em alguns segundos.';
      enviar.disabled = false;
    }
  });

  mostrar(0, false);
})();
