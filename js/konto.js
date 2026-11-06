// Schülerkonto: Lektionen buchen, Termine, Rechnungen, Profil
(async function () {
  const { t, esc } = App;
  const user = await App.loadUser();
  if (!user) { location.href = 'login.html'; return; }
  if (user.role === 'admin') { location.href = 'admin.html'; return; }
  App.renderHeader({ app: true });
  document.getElementById('hello').textContent = t('p.hello', { name: user.first_name });

  const pub = await App.api('GET', '/api/public?lang=' + App.lang);
  const phone = pub.content['contact.phone'] || '';
  const TABS = [['uebersicht', 'tab.overview'], ['buchen', 'tab.book'], ['termine', 'tab.appointments'], ['rechnungen', 'tab.invoices'], ['profil', 'tab.profile']];
  const tabs = document.getElementById('tabs');
  const view = document.getElementById('view');
  tabs.innerHTML = TABS.map(([id, k]) => `<button data-tab="${id}">${t(k)}</button>`).join('');
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) location.hash = b.dataset.tab; });
  window.addEventListener('hashchange', route);

  function route() {
    const id = location.hash.slice(1) || 'uebersicht';
    const tab = TABS.find(([k]) => k === id) ? id : 'uebersicht';
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    view.innerHTML = '';
    ({ uebersicht: overview, buchen: book, termine: appointments, rechnungen: invoices, profil: profile })[tab]()
      .catch((e) => { console.error(e); view.innerHTML = `<div class="empty">${t('err.generic')}</div>`; });
  }

  const now = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
  const waBtn = (cls = 'btn btn-cyan btn-sm') => phone ? `<a class="${cls}" href="${App.waLink(phone, `Hallo, hier ist ${user.first_name} ${user.last_name}. `)}" target="_blank" rel="noopener">${t('p.whatsapp')}</a>` : '';
  const contactCard = () => `
    <div class="card contact-mini">
      <h3>${t('p.contact_t')}</h3>
      <p class="muted" style="margin:0 0 14px">${t('p.contact_text')}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${waBtn()}<a class="btn btn-ghost btn-sm" href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a></div>
    </div>`;

  function apptCard(s) {
    return `<div class="slot ${s.status === 'done' ? 'done' : 'mine'}">
      <div class="time">${App.time(s.start_at)}<small>${App.endTime(s.start_at, s.minutes)} · ${s.minutes} ${t('p.min')}</small></div>
      <div class="meta"><span class="badge ${s.status}">${t('st.' + s.status)}</span>
        ${s.meeting_point ? `<div class="muted" style="font-size:14px;margin-top:4px">${t('p.meeting')}: ${esc(s.meeting_point)}</div>` : ''}
        ${s.message ? `<div class="note-box"><strong style="font-size:13px">${t('p.message')}</strong><br>${esc(s.message)}</div>` : ''}</div>
      <div class="acts"></div>
    </div>`;
  }
  function byDay(list) {
    const g = {};
    list.forEach((s) => (g[s.start_at.slice(0, 10)] ||= []).push(s));
    return Object.entries(g).map(([d, arr]) => `<div class="day-group"><div class="day-head">${esc(App.dayTitle(d))}</div>${arr.map(apptCard).join('')}</div>`).join('');
  }

  async function overview() {
    const [appts, orders, invs] = await Promise.all([App.api('GET', '/api/my/appointments'), App.api('GET', '/api/my/orders'), App.api('GET', '/api/my/invoices')]);
    const upcoming = appts.filter((a) => a.status === 'booked' && a.start_at >= now()).sort((a, b) => a.start_at.localeCompare(b.start_at));
    const done = appts.filter((a) => a.status === 'done');
    const waiting = orders.filter((o) => o.status === 'open').reduce((s, o) => s + o.remaining, 0);
    const open = invs.filter((i) => i.status === 'open').reduce((s, i) => s + i.total, 0);
    const next = upcoming[0];
    view.innerHTML = `
      <div class="grid g4" style="margin-bottom:20px">
        <div class="card stat accent"><b>${done.length}</b><span>${t('p.lessons_done')}</span></div>
        <div class="card stat"><b>${upcoming.length}</b><span>${t('p.upcoming')}</span></div>
        <div class="card stat"><b>${waiting}</b><span>${t('p.lessons_open')}</span></div>
        <div class="card stat"><b>${App.chf(open)}</b><span>${t('p.open_amount')}</span></div>
      </div>
      <div class="grid g2" style="align-items:start">
        <div class="card">
          <h2>${t('p.next')}</h2>
          ${next ? `<div class="day-head" style="font-size:20px">${esc(App.dayTitle(next.start_at))}</div>${apptCard(next)}`
            : `<p class="muted">${waiting ? t('p.no_upcoming') : t('p.none_next')}</p><a class="btn btn-cyan btn-sm" href="#buchen">${t('btn.book')}</a>`}
        </div>
        <div class="grid">${contactCard()}${howCard()}</div>
      </div>`;
  }

  function howCard() {
    return `<div class="card"><h3>${t('p.how_t')}</h3><ol class="how">
      <li>${t('p.how1')}</li><li>${t('p.how2')}</li><li>${t('p.how3')}</li></ol></div>`;
  }

  async function book() {
    const orders = await App.api('GET', '/api/my/orders');
    const types = pub.lessonTypes;
    let sel = types[0]?.id, qty = 1;
    view.innerHTML = `
      <div class="grid" style="grid-template-columns: 1.2fr 1fr; align-items:start" id="bookGrid">
        <form class="card" id="orderForm">
          <h2>${t('tab.book')}</h2>
          <div class="field"><label>${t('p.choose_type')}</label>
            <div class="type-pick">${types.map((lt) => `<button type="button" class="type-opt" data-lt="${lt.id}">
              <b>${lt.minutes} ${t('p.min')}</b><span>CHF ${App.chfShort(lt.price)}</span></button>`).join('')}</div>
          </div>
          <div class="field"><label>${t('p.qty')}</label>
            <div class="stepper"><button type="button" data-step="-1" aria-label="−">−</button><output id="qty">1</output><button type="button" data-step="1" aria-label="+">+</button></div>
          </div>
          <div class="field"><label for="onote">${t('p.note_when')}</label><textarea id="onote" rows="3" maxlength="500" placeholder="${esc(t('p.note_ph'))}"></textarea></div>
          <div class="order-total"><span>${t('p.total')}</span><b id="total"></b></div>
          <p class="muted" style="font-size:14px;margin:4px 0 16px">${t('p.price_hint')}</p>
          <button class="btn btn-cyan">${t('p.order_btn')}</button>
        </form>
        <div class="grid">
          ${howCard()}
          <div class="card">
            <h3>${t('p.my_orders')}</h3>
            ${orders.length ? orders.map((o) => `
              <div class="order-row">
                <div><strong>${o.qty} × ${o.minutes} ${t('p.min')}</strong> <span class="muted">· ${App.date(o.created_at.slice(0, 10))}</span>
                  <div class="muted" style="font-size:14px">${t('p.scheduled', { a: o.scheduled, b: o.qty })}</div></div>
                <div>${o.status === 'open' ? `<span class="badge open">${t('p.waiting')}</span> <button class="btn btn-ghost btn-sm" data-withdraw="${o.id}">${t('p.withdraw')}</button>` : `<span class="badge done">✓</span>`}</div>
              </div>`).join('') : `<p class="muted">${t('p.no_orders')}</p>`}
          </div>
        </div>
      </div>`;
    if (matchMedia('(max-width: 900px)').matches) view.querySelector('#bookGrid').style.gridTemplateColumns = '1fr';
    const f = view.querySelector('#orderForm');
    const draw = () => {
      f.querySelectorAll('.type-opt').forEach((b) => b.classList.toggle('active', b.dataset.lt == sel));
      f.querySelector('#qty').textContent = qty;
      const lt = types.find((x) => x.id == sel);
      f.querySelector('#total').textContent = lt ? `CHF ${App.chf(lt.price * qty)}` : '–';
    };
    f.querySelectorAll('.type-opt').forEach((b) => b.onclick = () => { sel = Number(b.dataset.lt); draw(); });
    f.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => { qty = Math.max(1, Math.min(20, qty + Number(b.dataset.step))); draw(); });
    draw();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('.btn-cyan'); btn.disabled = true;
      try { await App.api('POST', '/api/orders', { lesson_type_id: sel, qty, note: f.querySelector('#onote').value }); App.toast(t('p.order_ok')); book(); }
      catch (ex) { App.toast(App.errText(ex), true); btn.disabled = false; }
    });
    view.querySelectorAll('[data-withdraw]').forEach((b) => b.onclick = async () => {
      if (!(await App.confirm(t('p.confirm_withdraw'), t('p.withdraw'), t('p.abort')))) return;
      await App.api('POST', `/api/orders/${b.dataset.withdraw}/cancel`); App.toast(t('p.withdrawn')); book();
    });
  }

  async function appointments() {
    const appts = await App.api('GET', '/api/my/appointments');
    const upcoming = appts.filter((a) => a.status === 'booked' && a.start_at >= now()).sort((a, b) => a.start_at.localeCompare(b.start_at));
    const past = appts.filter((a) => !upcoming.includes(a));
    view.innerHTML = `
      <div class="grid" style="grid-template-columns: 1.4fr 1fr; align-items:start" id="apGrid">
        <div>
          <h2 class="display" style="font-size:34px">${t('p.upcoming')}</h2>
          ${upcoming.length ? byDay(upcoming) : `<div class="empty">${t('p.no_upcoming')}</div>`}
          <h2 class="display" style="font-size:34px;margin-top:34px">${t('p.past')}</h2>
          ${past.length ? past.map((a) => `<div class="order-row"><span><strong>${esc(App.date(a.start_at, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }))}</strong>
            <span class="muted"> · ${App.time(a.start_at)} · ${a.minutes} ${t('p.min')}</span></span><span class="badge ${a.status}">${t('st.' + a.status)}</span></div>`).join('') : `<p class="muted">${t('p.no_past')}</p>`}
        </div>
        <div class="grid">${contactCard()}</div>
      </div>`;
    if (matchMedia('(max-width: 900px)').matches) view.querySelector('#apGrid').style.gridTemplateColumns = '1fr';
  }

  async function invoices() {
    const invs = await App.api('GET', '/api/my/invoices');
    view.innerHTML = `<div class="card">
      <h2>${t('tab.invoices')}</h2>
      ${invs.length ? `<table class="list"><thead><tr><th>${t('p.inv_no')}</th><th class="hide-sm">${t('p.date')}</th><th>${t('p.due')}</th><th class="num">${t('p.amount')}</th><th>${t('p.status')}</th><th></th></tr></thead><tbody>
        ${invs.map((i) => {
          const st = App.isOverdue(i) ? 'overdue' : i.status;
          return `<tr><td>${esc(i.number)}</td><td class="hide-sm">${App.date(i.created_at)}</td><td>${App.date(i.due_at)}</td>
            <td class="num">CHF ${App.chf(i.total)}</td><td><span class="badge ${st}">${t('st.' + st)}</span></td>
            <td class="num"><a class="btn btn-ghost btn-sm" href="rechnung.html#${i.id}">${t('p.view')}</a></td></tr>`;
        }).join('')}</tbody></table>` : `<p class="muted">${t('p.no_invoices')}</p>`}
    </div>`;
  }

  async function profile() {
    const u = App.user;
    const f = (name, label, type = 'text', val = u[name]) => `<div class="field"><label>${t(label)}</label><input name="${name}" type="${type}" value="${esc(val || '')}"></div>`;
    view.innerHTML = `<div class="grid g2" style="align-items:start">
      <form class="card" id="pf">
        <h2>${t('p.my_data')}</h2>
        <div class="row">${f('first_name', 'auth.first')}${f('last_name', 'auth.last')}</div>
        <div class="field"><label>${t('auth.email')}</label><input value="${esc(u.email)}" disabled></div>
        <div class="row">${f('phone', 'auth.phone', 'tel')}${f('birthdate', 'auth.birth', 'date')}</div>
        <div class="row">${f('street', 'auth.street')}${f('zip_city', 'auth.zip')}</div>
        ${!u.street || !u.zip_city ? `<p class="muted" style="font-size:14px;margin-top:-4px">${t('p.billing_note')}</p>` : ''}
        <div class="field"><label>${t('p.lang')}</label><select name="lang">${Object.entries(LANG_NAMES).map(([k, v]) => `<option value="${k}" ${k === u.lang ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <button class="btn btn-cyan">${t('p.save')}</button>
      </form>
      <form class="card" id="pw">
        <h2>${t('p.change_pw')}</h2>
        <div class="field"><label>${t('p.pw_current')}</label><input name="current" type="password" autocomplete="current-password"></div>
        <div class="field"><label>${t('p.pw_new')}</label><input name="next" type="password" autocomplete="new-password" placeholder="${t('auth.pw_hint')}"></div>
        <div class="form-error"></div>
        <button class="btn">${t('p.save')}</button>
      </form></div>`;
    view.querySelector('#pf').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { App.user = (await App.api('PUT', '/api/me', Object.fromEntries(new FormData(e.target)))).user; App.toast(t('p.saved')); }
      catch (ex) { App.toast(App.errText(ex), true); }
    });
    view.querySelector('#pw').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = e.target.querySelector('.form-error'); err.textContent = '';
      try { await App.api('POST', '/api/me/password', Object.fromEntries(new FormData(e.target))); e.target.reset(); App.toast(t('p.saved')); }
      catch (ex) { err.textContent = App.errText(ex); }
    });
  }

  route();
})();
