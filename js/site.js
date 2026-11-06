// Öffentliche Seiten + Editor-Modus für Administratoren
(async function () {
  const { t, esc } = App;
  const $ = (id) => document.getElementById(id);
  const STEP_COUNT = 7;
  let data = { content: {}, lessonTypes: [], adminFee: 0 };
  let editing = false;

  await App.loadUser();
  App.renderHeader({ editable: true });
  App.applyStatic();

  // Wiederholende Blöcke aufbauen
  const stepLine = $('stepLine');
  if (stepLine) stepLine.innerHTML = Array.from({ length: STEP_COUNT }, (_, n) => {
    const i = n + 1;
    return `<li><a href="ablauf.html#schritt-${i}"><span class="step-ico">${App.icon('s' + i)}</span><span data-k="steps.${i}.t"></span></a></li>`;
  }).join('');
  const steps = $('steps');
  if (steps) steps.innerHTML = Array.from({ length: STEP_COUNT }, (_, n) => {
    const i = n + 1;
    return `<li id="schritt-${i}" class="${i === 4 ? 'mine' : ''}">
      <span class="step-ico">${App.icon('s' + i)}</span>
      <div>
        <h2 data-k="steps.${i}.t"></h2>
        <p data-k="steps.${i}.d"></p>
        ${i === 4 ? `<p class="step-you"><b>${t('step.you')}</b><a class="btn btn-sm" href="login.html#buchen">${t('btn.book')}</a></p>` : ''}
      </div>
    </li>`;
  }).join('');
  const faq = $('faqList');
  if (faq) faq.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<details data-faq="${i}"><summary><span data-k="faq.${i}.q"></span></summary><p class="pre" data-k="faq.${i}.a"></p></details>`).join('');
  const how = $('how');
  if (how) how.innerHTML = [1, 2, 3].map((i) => `<li>${t('p.how' + i)}</li>`).join('');

  async function load() {
    data = await App.api('GET', '/api/public?lang=' + App.lang);
    render();
    App.renderChrome(data.content);
  }

  function render() {
    const c = data.content;
    document.querySelectorAll('[data-k]').forEach((el) => {
      if (editing && el === document.activeElement) return;
      const v = c[el.dataset.k] || '';
      if (el.id === 'places' && !editing) {
        el.classList.remove('pre');
        el.innerHTML = v.split('\n').filter((s) => s.trim()).map((s) => `<li><span>${esc(s)}</span>${App.icon('arrow')}</li>`).join('');
      } else if (el.hasAttribute('data-first-para') && !editing) {
        el.textContent = v.split(/\n\s*\n/)[0];
      } else {
        if (el.id === 'places') el.classList.add('pre');
        el.textContent = v;
      }
    });
    // Leere FAQ-Einträge ausblenden (im Editor sichtbar, damit man sie füllen kann)
    document.querySelectorAll('[data-faq]').forEach((d) => {
      d.classList.toggle('hidden', !editing && !(c[`faq.${d.dataset.faq}.q`] || '').trim());
      if (editing) d.open = true;
    });
    const phone = (c['contact.phone'] || '').trim();
    document.querySelectorAll('[data-tel]').forEach((a) => { a.href = editing ? 'javascript:void 0' : 'tel:' + phone.replace(/[^\d+]/g, ''); });
    document.querySelectorAll('[data-wa]').forEach((a) => { a.href = App.waLink(phone); });
    document.querySelectorAll('[data-mail]').forEach((a) => { a.href = editing ? 'javascript:void 0' : 'mailto:' + (c['contact.email'] || '').trim(); });

    renderImages();
    renderHeroPrice();
    renderFacts();
    renderPrices();
    renderCalc();
    renderSpec();
    if ($('heroMap')) renderSchema();
  }

  // Strukturierte Daten für Google (Adresse, Telefon, Region) – aus den bearbeitbaren Texten
  function renderSchema() {
    const c = data.content;
    const lines = (c['contact.address'] || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const zipLine = lines.find((l) => /^\d{4}\s/.test(l)) || '';
    const street = lines[lines.indexOf(zipLine) - 1] || '';
    const schema = {
      '@context': 'https://schema.org', '@type': 'DrivingSchool', name: 'Fahrschule Meier',
      url: location.origin + '/', telephone: (c['contact.phone'] || '').trim(), email: (c['contact.email'] || '').trim(),
      address: { '@type': 'PostalAddress', streetAddress: street, postalCode: zipLine.slice(0, 4), addressLocality: zipLine.slice(5), addressRegion: 'TG', addressCountry: 'CH' },
      areaServed: (c['region.places'] || '').split('\n').map((s) => s.trim()).filter(Boolean).map((n) => ({ '@type': 'Place', name: n })),
      priceRange: data.lessonTypes.length ? `CHF ${Math.min(...data.lessonTypes.map((l) => l.price))}–${Math.max(...data.lessonTypes.map((l) => l.price))}` : undefined,
    };
    let el = $('ld-json');
    if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'ld-json'; document.head.appendChild(el); }
    el.textContent = JSON.stringify(schema);
  }

  function renderImages() {
    document.querySelectorAll('[data-img]').forEach((fig) => {
      const key = fig.dataset.img;
      const url = data.content[key];
      fig.classList.toggle('has-img', !!url);
      if (fig.classList.contains('hero-photo')) fig.closest('.hero').classList.toggle('with-photo', !!url);
      // Startbild: ohne Foto bleibt die Karte. Sonst zeigt ein Platzhalter, welches Bild hierhin kommt.
      const fallback = fig.classList.contains('hero-photo') ? '' : `<div class="ph-empty">${App.icon('image')}<span>${esc(t(fig.dataset.label))}</span></div>`;
      fig.innerHTML = `
        ${url ? `<img src="${esc(url)}" alt="${esc(t(fig.dataset.label))}" loading="lazy">` : fallback}
        <div class="ph-tools">
          <label class="btn btn-sm">${t('ph.upload')}<input type="file" accept="image/*" hidden></label>
          ${url ? `<button class="btn btn-ghost btn-sm" data-remove>${t('ph.remove')}</button>` : ''}
        </div>`;
      fig.querySelector('input').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const fd = new FormData(); fd.append('file', file);
        try {
          const r = await App.api('POST', '/api/admin/image/' + key, fd, true);
          data.content[key] = r.url; renderImages(); App.toast(t('p.saved'));
        } catch (err) { App.toast(App.errText(err), true); }
      });
      fig.querySelector('[data-remove]')?.addEventListener('click', async () => {
        await App.api('DELETE', '/api/admin/image/' + key);
        delete data.content[key]; renderImages();
      });
    });
  }

  const cheapest = () => [...data.lessonTypes].sort((a, b) => a.price - b.price)[0];

  function renderHeroPrice() {
    const el = $('heroPrice');
    const lt = cheapest();
    if (!el || !lt) return;
    const [whole, rest] = App.chfShort(lt.price).split('.');
    el.innerHTML = `${esc(t('hero.from'))} <b>${esc(whole)}</b><span class="rest">.${esc(rest)}</span> CHF <small>${esc(t('hero.min', { m: lt.minutes }))}</small>`;
  }

  function renderFacts() {
    const el = $('facts');
    if (!el) return;
    const lt = cheapest();
    el.innerHTML = [
      [t('fact.car'), t('fact.car_s')],
      [t('fact.cat'), t('fact.cat_s')],
      lt ? [t('fact.from', { p: App.chfShort(lt.price) }), t('fact.from_s', { m: lt.minutes })] : null,
      [t('fact.online'), t('fact.online_s')],
    ].filter(Boolean).map(([b, s]) => `<li>${App.icon('check')}<span><b>${esc(b)}</b> ${esc(s)}</span></li>`).join('');
  }

  function renderSpec() {
    const el = $('carSpec');
    if (!el) return;
    el.innerHTML = [['car.spec_car', t('fact.car')], ['car.spec_gear', t('car.spec_gear_v')], ['car.spec_cat', t('car.spec_cat_v')]]
      .map(([k, v]) => `<div><dt>${esc(t(k))}</dt><dd>${esc(v)}</dd></div>`).join('');
  }

  function renderPrices() {
    const board = $('priceBoard');
    if (!board) return;
    const row = (what, sub, amount, cls = '', input = '') => {
      const [whole, rest] = App.chfShort(amount).split('.');
      return `
      <div class="price-row ${cls}">
        <div class="what">${what}<small>${sub}</small></div>
        <div class="amount">${input || `<b>${esc(whole)}</b>.${esc(rest)} <span>CHF</span>`}</div>
      </div>`;
    };
    board.innerHTML = data.lessonTypes.map((lt) => row(esc(t('price.lesson')), esc(t('price.min', { m: lt.minutes })), lt.price, '',
      editing ? `<input type="number" min="0" step="1" value="${lt.price}" data-lt="${lt.id}" data-min="${lt.minutes}" aria-label="Preis"> <span>CHF</span>` : ''
    )).join('') + row(`<span data-k="prices.fee_label">${esc(data.content['prices.fee_label'] || '')}</span>`, esc(t('price.once')), data.adminFee, 'fee',
      editing ? `<input type="number" min="0" step="1" value="${data.adminFee}" data-fee aria-label="Gebühr"> <span>CHF</span>` : '');
    if (editing) {
      makeEditable(board.querySelector('[data-k]'));
      board.querySelectorAll('[data-lt]').forEach((inp) => inp.addEventListener('change', async () => {
        await App.api('PUT', '/api/admin/lesson-types/' + inp.dataset.lt, { minutes: Number(inp.dataset.min), price: Number(inp.value) });
        const lt = data.lessonTypes.find((x) => x.id == inp.dataset.lt); lt.price = Number(inp.value);
        renderFacts(); renderHeroPrice(); renderCalc(); App.toast(t('p.saved'));
      }));
      board.querySelector('[data-fee]').addEventListener('change', async (e) => {
        await App.api('PUT', '/api/admin/settings', { admin_fee: Number(e.target.value) });
        data.adminFee = Number(e.target.value); renderCalc(); App.toast(t('p.saved'));
      });
    }
  }

  // ---------- Preisrechner ----------
  let calc = { n: 25, id: null };
  function renderCalc() {
    const el = $('calc');
    if (!el || !data.lessonTypes.length) return;
    if (!data.lessonTypes.some((l) => l.id === calc.id)) calc.id = data.lessonTypes[0].id;
    if (!el.dataset.ready) {
      el.dataset.ready = '1';
      el.querySelector('#calcTypes').innerHTML = data.lessonTypes.map((l) => `<button type="button" data-id="${l.id}">${esc(t('price.min', { m: l.minutes }))}</button>`).join('');
      el.querySelector('#calcTypes').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { calc.id = Number(b.dataset.id); paint(); } });
      el.querySelector('#calcN').addEventListener('input', (e) => { calc.n = Number(e.target.value); paint(); });
    }
    paint();
    function paint() {
      const lt = data.lessonTypes.find((l) => l.id === calc.id);
      el.querySelectorAll('#calcTypes button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.id) === calc.id)));
      const range = el.querySelector('#calcN');
      range.value = calc.n;
      range.style.setProperty('--fill', ((calc.n - range.min) / (range.max - range.min)) * 100 + '%');
      el.querySelector('#calcNOut').textContent = calc.n;
      el.querySelector('#calcTotal').textContent = (calc.n * lt.price + Number(data.adminFee)).toLocaleString('de-CH');
      el.querySelector('#calcFee').textContent = t('calc.fee', { f: data.adminFee });
    }
  }

  // ---------- Karte ----------
  async function renderMaps() {
    const hosts = [...document.querySelectorAll('[data-map]')];
    if (!hosts.length) return;
    let svg;
    try { svg = await (await fetch('img/map.svg')).text(); } catch { return; }
    hosts.forEach((host) => {
      host.innerHTML = svg;
      const el = host.querySelector('svg');
      const fit = () => {
        const wide = window.innerWidth > 960;
        el.setAttribute('viewBox', wide ? host.dataset.view : (host.dataset.viewSm || host.dataset.view));
      };
      fit();
      if (host.dataset.view !== host.dataset.viewSm) window.addEventListener('resize', fit, { passive: true });
      if (host.hasAttribute('data-drive')) drive(el);
    });
  }

  // Der blaue L-Schild-Marker fährt einmal die Route ab und schaltet die Orte frei
  function drive(svg) {
    const route = svg.querySelector('.m-route');
    const plate = svg.querySelector('.m-plate');
    const places = [...svg.querySelectorAll('.m-hub, .m-home')].map((g) => {
      const c = g.querySelector('circle');
      return { g, x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), at: 0 };
    });
    const len = route.getTotalLength();
    const samples = 240;
    places.forEach((p) => {
      let best = Infinity;
      for (let i = 0; i <= samples; i++) {
        const q = route.getPointAtLength((i / samples) * len);
        const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < best) { best = d; p.at = i / samples; }
      }
    });
    const put = (u) => {
      const q = route.getPointAtLength(u * len);
      plate.setAttribute('transform', `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})`);
      route.style.strokeDashoffset = 1 - u;
      places.forEach((p) => p.g.classList.toggle('on', u >= p.at - 0.005));
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return put(1);
    put(0);
    const dur = 4200;
    const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
    let t0;
    const tick = (now) => {
      t0 ??= now;
      const u = Math.min(1, (now - t0) / dur);
      put(ease(u));
      if (u < 1) requestAnimationFrame(tick);
    };
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      setTimeout(() => requestAnimationFrame(tick), 350);
    }, { threshold: 0.4 });
    seen.observe(svg);
  }

  // Ablauf: die Linie füllt sich beim Scrollen
  function trackSteps() {
    const list = $('steps');
    if (!list) return;
    const update = () => {
      const r = list.getBoundingClientRect();
      const u = Math.max(0, Math.min(1, (innerHeight * 0.6 - r.top) / r.height));
      list.style.setProperty('--done', (u * 100).toFixed(1) + '%');
      list.querySelectorAll('li').forEach((li) => li.classList.toggle('reached', li.getBoundingClientRect().top < innerHeight * 0.6));
    };
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
  }

  // ---------- Editor-Modus ----------
  function makeEditable(el) {
    if (!el || el.isContentEditable) return;
    try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.spellcheck = true;
    el.addEventListener('keydown', onKey);
    el.addEventListener('blur', onBlur);
    el.addEventListener('click', stopLinks);
  }
  function stopLinks(e) { if (editing) e.preventDefault(); }
  function onKey(e) {
    // Enter ohne Shift in einzeiligen Feldern beendet die Eingabe
    if (e.key === 'Escape') { e.target.textContent = data.content[e.target.dataset.k] || ''; e.target.blur(); }
  }
  // Text aus dem bearbeiteten Element lesen
  function plainText(node) {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeName === 'BR') out += '\n';
      else if (/^(DIV|P)$/.test(n.nodeName)) out += (out && !out.endsWith('\n') ? '\n' : '') + plainText(n);
      else out += plainText(n);
    });
    return out;
  }
  async function onBlur(e) {
    const el = e.target, key = el.dataset.k;
    const value = plainText(el).replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (value === (data.content[key] || '')) return;
    try {
      await App.api('PUT', '/api/admin/content', { key, lang: App.lang, value });
      data.content[key] = value;
      App.toast(`${t('p.saved')} (${LANG_NAMES[App.lang]})`);
    } catch (err) { App.toast(App.errText(err), true); }
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    render();
    document.querySelectorAll('[data-k]').forEach((el) => {
      if (on) makeEditable(el);
      else { el.contentEditable = 'false'; el.removeEventListener('blur', onBlur); el.removeEventListener('keydown', onKey); el.removeEventListener('click', stopLinks); }
    });
    if (!on) render();
    let bar = document.querySelector('.editbar');
    if (on && !bar) {
      bar = document.createElement('div');
      bar.className = 'editbar';
      bar.innerHTML = `<b>Editor-Modus</b>
        <span>Texte anklicken und tippen – wird beim Verlassen gespeichert. Sprache: <strong>${LANG_NAMES[App.lang]}</strong>${App.lang !== 'de' ? ' (leere Felder zeigen den deutschen Text)' : ''}.</span>
        <a class="btn btn-ghost btn-sm" href="admin.html">Verwaltung</a>
        <button class="btn btn-sm" id="editDone">Fertig</button>`;
      document.body.appendChild(bar);
      bar.querySelector('#editDone').addEventListener('click', () => setEditing(false));
    } else if (!on && bar) bar.remove();
    const tg = $('editToggle');
    if (tg) tg.textContent = on ? 'Fertig' : t('btn.edit');
  }

  await load();
  renderMaps();
  trackSteps();
  // Sprung zu einem Anker, nachdem die Texte geladen sind
  if (location.hash.length > 1 && location.hash !== '#edit') document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });

  if (App.user?.role === 'admin') {
    $('editToggle')?.addEventListener('click', () => setEditing(!editing));
    if (location.hash === '#edit') { setEditing(true); history.replaceState(null, '', location.pathname); }
  }
})();
