// Gemeinsame Hilfsfunktionen für alle Seiten
(function () {
  // Speicher für die Spracheinstellung (localStorage, sonst window.name als Ersatz)
  const store = {
    get(k) { try { const v = localStorage.getItem(k); if (v !== null) return v; } catch { /* gesperrt */ } try { return JSON.parse(window.name || '{}')['pref_' + k] ?? null; } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* gesperrt */ } try { const o = JSON.parse(window.name || '{}'); o['pref_' + k] = v; window.name = JSON.stringify(o); } catch { window.name = JSON.stringify({ ['pref_' + k]: v }); } },
  };
  let lang = store.get('lang') || 'de';
  if (!I18N[lang]) lang = 'de';
  document.documentElement.lang = lang;

  const App = (window.App = {
    lang,
    user: null,
    setLang(l) { store.set('lang', l); location.reload(); },
    t(key, vars) {
      let s = (I18N[App.lang] && I18N[App.lang][key]) || I18N.de[key] || key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
      return s;
    },
    esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    // Auf statischem Hosting gibt es kein Backend: Texte kommen aus data/public.json
    staticHost: /\.github\.io$/.test(location.hostname),
    async publicData(url) {
      const lang = new URL(url, location.href).searchParams.get('lang') || 'de';
      const all = await (await fetch('data/public.json', { cache: 'no-cache' })).json();
      return { content: { ...all.content.de, ...(all.content[lang] || {}) }, lessonTypes: all.lessonTypes, adminFee: all.adminFee };
    },
    async api(method, url, body, isForm) {
      if (App.staticHost) {
        if (url.startsWith('/api/public')) return App.publicData(url);
        if (url === '/api/me' && method === 'GET') return { user: null };
        const e = new Error('preview'); e.code = 'preview'; throw e;
      }
      const opt = { method, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
      if (body && !isForm) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
      if (isForm) opt.body = body;
      const r = await fetch(url, opt);
      let data = {};
      try { data = await r.json(); } catch { /* leer */ }
      if (!r.ok) { const e = new Error(data.error || 'generic'); e.code = data.error || 'generic'; e.status = r.status; throw e; }
      return data;
    },
    errText(e, vars) {
      const k = 'err.' + (e.code || 'generic');
      return I18N.de[k] ? App.t(k, vars) : App.t('err.generic');
    },
    toast(msg, isErr) {
      let el = document.querySelector('.toast');
      if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
      el.textContent = msg; el.classList.toggle('err', !!isErr); el.classList.add('show');
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600);
    },
    chf(n) { return Number(n || 0).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    chfShort(n) { const v = Number(n || 0); return Number.isInteger(v) ? `${v}.–` : App.chf(v); },
    locale() { return LOCALES[App.lang] || 'de-CH'; },
    date(s, opts) { return new Date(s.length === 10 ? s + 'T12:00' : s).toLocaleDateString(App.locale(), opts || { day: '2-digit', month: '2-digit', year: 'numeric' }); },
    dayTitle(s) { return new Date(s.slice(0, 10) + 'T12:00').toLocaleDateString(App.locale(), { weekday: 'long', day: 'numeric', month: 'long' }); },
    time(s) { return s.slice(11, 16); },
    endTime(s, min) { const d = new Date(s); d.setMinutes(d.getMinutes() + min); return d.toTimeString().slice(0, 5); },
    // WhatsApp-Link aus einer Schweizer Nummer (078 … → 4178 …)
    waLink(phone, text) {
      let n = String(phone || '').replace(/[^\d+]/g, '');
      if (n.startsWith('+')) n = n.slice(1); else if (n.startsWith('00')) n = n.slice(2); else if (n.startsWith('0')) n = '41' + n.slice(1);
      return `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}`;
    },
    isOverdue(inv) { return inv.status === 'open' && inv.due_at < new Date().toISOString().slice(0, 10); },
    modal(html, onMount) {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
      document.body.appendChild(bg);
      const close = () => bg.remove();
      bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
      document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
      onMount && onMount(bg.querySelector('.modal'), close);
      return close;
    },
    confirm(msg, okLabel, cancelLabel) {
      return new Promise((resolve) => {
        let done = false;
        const close = App.modal(`<p style="font-size:18px;margin-top:0">${App.esc(msg)}</p>
          <div class="acts"><button class="btn btn-ghost" data-no>${App.esc(cancelLabel || 'Abbrechen')}</button><button class="btn btn-cyan" data-yes>${App.esc(okLabel || 'OK')}</button></div>`,
        (m, cl) => {
          m.querySelector('[data-no]').onclick = () => { done = true; cl(); resolve(false); };
          m.querySelector('[data-yes]').onclick = () => { done = true; cl(); resolve(true); };
        });
        const obs = new MutationObserver(() => { if (!done && !document.querySelector('.modal-bg')) { obs.disconnect(); resolve(false); } });
        obs.observe(document.body, { childList: true });
      });
    },
    async loadUser() {
      try { App.user = (await App.api('GET', '/api/me')).user; } catch { App.user = null; }
      return App.user;
    },
    async logout() { await App.api('POST', '/api/logout'); location.href = 'index.html'; },

    renderHeader(opts = {}) {
      const el = document.getElementById('topbar');
      if (!el) return;
      const u = App.user;
      const page = location.pathname.split('/').pop() || 'index.html';
      const links = [['ueber-mich.html', 'nav.about'], ['preise.html', 'nav.prices'], ['ablauf.html', 'nav.steps'], ['ablauf.html#faq', 'nav.faq'], ['kontakt.html', 'nav.contact']];
      el.classList.toggle('logged', !!u);
      el.innerHTML = `
        <div class="wrap">
          <a class="brand" href="index.html" aria-label="Fahrschule Meier"><img src="img/logo-dark.png" alt="Meier Fahrschule" width="523" height="159"></a>
          <nav class="nav" id="mainnav">${links.map(([href, k]) => `<a href="${href}"${href === page ? ' aria-current="page"' : ''}>${App.t(k)}</a>`).join('')}${u && opts.app ? `<a href="#" class="nav-app" id="logoutNav">${App.t('btn.logout')}</a>` : ''}${u ? '' : `<a href="login.html" class="nav-login">${App.t('btn.login')}</a>`}</nav>
          <div class="top-actions">
            <a class="top-phone" id="topPhone" hidden>${App.icon('phone')}<span></span></a>
            <label class="lang" title="Sprache / Language"><select id="langsel" aria-label="Sprache">
              ${Object.entries(LANG_NAMES).map(([k, v]) => `<option value="${k}" ${k === App.lang ? 'selected' : ''}>${v}</option>`).join('')}
            </select></label>
            ${u ? `
              ${u.role === 'admin' && opts.editable ? `<button class="btn btn-ghost btn-sm" id="editToggle">${App.t('btn.edit')}</button>` : ''}
              <a class="btn btn-sm" href="${u.role === 'admin' ? 'admin.html' : 'konto.html'}">${App.t(u.role === 'admin' ? 'btn.admin' : 'btn.account')}</a>
              ${opts.app ? `<button class="btn btn-ghost btn-sm hide-xs" id="logoutBtn">${App.t('btn.logout')}</button>` : ''}`
            : `<a class="top-login" href="login.html">${App.t('btn.login')}</a><a class="btn btn-sm top-book" href="buchen.html">${App.t('btn.book')}</a>`}
          </div>
          <button class="menu-btn" id="menuBtn" aria-label="${App.t('menu.open')}" aria-expanded="false" aria-controls="mainnav"><span></span><span></span><span></span></button>
        </div>`;
      el.querySelector('#langsel').addEventListener('change', (e) => App.setLang(e.target.value));
      const nav = el.querySelector('#mainnav');
      const btn = el.querySelector('#menuBtn');
      const setOpen = (on) => { nav.classList.toggle('open', on); btn.setAttribute('aria-expanded', on); el.classList.toggle('menu-open', on); };
      btn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
      nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
      el.querySelector('#logoutBtn')?.addEventListener('click', App.logout);
      el.querySelector('#logoutNav')?.addEventListener('click', (e) => { e.preventDefault(); App.logout(); });
      // Kopfzeile wird beim Scrollen schmaler
      const onScroll = () => el.classList.toggle('scrolled', window.scrollY > 24);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    },

    // Fusszeile und Handy-Leiste, gefüllt mit den Kontaktdaten aus den Texten
    renderChrome(c) {
      const esc = App.esc;
      const phone = (c['contact.phone'] || '').trim();
      const mail = (c['contact.email'] || '').trim();
      const tel = 'tel:' + phone.replace(/[^\d+]/g, '');
      const tp = document.getElementById('topPhone');
      if (tp && phone) { tp.hidden = false; tp.href = tel; tp.querySelector('span').textContent = phone; }
      const foot = document.getElementById('footer');
      if (foot) foot.innerHTML = `
        <div class="wrap foot-grid">
          <div class="foot-brand">
            <img src="img/logo-light.png" alt="Meier Fahrschule" width="523" height="159">
            <p class="pre">${esc(c['contact.hours'] || '')}</p>
          </div>
          <div>
            <h2>${App.t('footer.pages')}</h2>
            <ul>
              <li><a href="buchen.html">${App.t('btn.book')}</a></li>
              <li><a href="ueber-mich.html">${App.t('nav.about')}</a></li>
              <li><a href="preise.html">${App.t('nav.prices')}</a></li>
              <li><a href="ablauf.html">${App.t('nav.steps')}</a></li>
              <li><a href="ablauf.html#faq">${App.t('nav.faq')}</a></li>
              <li><a href="kontakt.html">${App.t('nav.contact')}</a></li>
            </ul>
          </div>
          <div>
            <h2>${App.t('nav.contact')}</h2>
            <p class="pre">${esc(c['contact.address'] || '')}</p>
            <ul>
              <li><a href="${esc(tel)}">${esc(phone)}</a></li>
              <li><a href="mailto:${esc(mail)}">${esc(mail)}</a></li>
              <li><a href="${esc(App.waLink(phone))}" target="_blank" rel="noopener">${App.t('btn.whatsapp')}</a></li>
            </ul>
          </div>
        </div>
        <div class="wrap foot-end">
          <span>© ${new Date().getFullYear()} Fahrschule Meier</span>
          <a href="impressum.html">${App.t('footer.legal')}</a>
          <a href="login.html">${App.t('btn.login')}</a>
        </div>`;
      if (!document.querySelector('.callbar') && foot) {
        const bar = document.createElement('div');
        bar.className = 'callbar';
        bar.innerHTML = `
          <a href="${esc(tel)}">${App.icon('phone')}${App.t('btn.call')}</a>
          <a href="${esc(App.waLink(phone))}" target="_blank" rel="noopener">${App.icon('chat')}${App.t('btn.whatsapp')}</a>
          <a class="primary" href="buchen.html">${App.t('btn.book')}</a>`;
        document.body.appendChild(bar);
        document.body.classList.add('has-callbar');
      }
    },

    icon(name) {
      const p = App.ICONS[name] || '';
      return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
    },
    ICONS: {
      user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1-3.8 3.9-5.8 7.5-5.8s6.5 2 7.5 5.8"/>',
      image: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M4 17l5-5 3.5 3.5 2.5-2.5 5 5"/>',
      phone: '<path d="M6.6 3.5h2.6l1.5 4-2 1.5a12 12 0 0 0 6.3 6.3l1.5-2 4 1.5v2.6c0 1.2-1 2.1-2.2 2.1A15.8 15.8 0 0 1 4.5 5.7c0-1.2.9-2.2 2.1-2.2Z"/>',
      chat: '<path d="M4 20l1.3-3.9A8 8 0 1 1 8.3 19L4 20Z"/>',
      check: '<path d="M4.5 12.5l5 5 10-11"/>',
      arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
      mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M4 7l8 6 8-6"/>',
      pin: '<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
      clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.3 2"/>',
      s1: '<rect x="3.5" y="7.5" width="17" height="12" rx="1.5"/><path d="M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M12 10.5v6M9 13.5h6"/>',
      s2: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
      s3: '<path d="M6 3.5h9l3.5 3.5v13.5H6Z"/><path d="M14.5 3.5V7.5h4M9 13l2 2 4-4.5"/>',
      s4: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M3.8 10.5 9.9 11.5M20.2 10.5 14.1 11.5M12 14.2v6.2"/>',
      s5: '<rect x="3.5" y="4.5" width="17" height="11" rx="1"/><path d="M8.5 20l3.5-4.5 3.5 4.5M8 8.5h8M8 11.5h5"/>',
      s6: '<path d="M6 21V4"/><path d="M6 4.5h12l-2.5 4 2.5 4H6"/>',
      s7: '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.5-1.5 1.6-2.2 3-2.2s2.5.7 3 2.2M14.5 10h4M14.5 13.5h4"/>',
    },
  });

  // Elemente mit data-t übersetzen
  App.applyStatic = (root = document) => {
    root.querySelectorAll('[data-t]').forEach((n) => { n.textContent = App.t(n.dataset.t); });
    root.querySelectorAll('[data-th]').forEach((n) => { n.innerHTML = App.t(n.dataset.th); });
    root.querySelectorAll('[data-tp]').forEach((n) => { n.placeholder = App.t(n.dataset.tp); });
  };
})();
