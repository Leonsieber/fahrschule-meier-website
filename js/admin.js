// Verwaltung (nur Fahrlehrer): Kalender, Anfragen, Schüler, Rechnungen, Einstellungen
(async function () {
  const { esc } = App;
  const user = await App.loadUser();
  if (!user) { location.href = 'login.html'; return; }
  if (user.role !== 'admin') { location.href = 'konto.html'; return; }
  App.renderHeader({ app: true });

  let S = await App.api('GET', '/api/admin/settings');
  let students = [];
  const TABS = [['kalender', 'Kalender'], ['anfragen', 'Anfragen'], ['schueler', 'Schüler'], ['rechnungen', 'Rechnungen'], ['einstellungen', 'Einstellungen']];
  const tabs = document.getElementById('tabs');
  const view = document.getElementById('view');
  window.addEventListener('hashchange', route);

  async function refreshBadge() {
    const orders = await App.api('GET', '/api/admin/orders');
    const n = orders.reduce((s, o) => s + o.remaining, 0);
    tabs.innerHTML = TABS.map(([id, l]) => `<button data-tab="${id}">${l}${id === 'anfragen' && n ? ` <span class="tab-count">${n}</span>` : ''}</button>`).join('');
    markTab();
    return orders;
  }
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) location.hash = b.dataset.tab; });
  const curTab = () => { const id = (location.hash.slice(1) || 'kalender').split('/')[0]; return TABS.find(([k]) => k === id) ? id : 'kalender'; };
  const markTab = () => tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === curTab()));

  function route() {
    const arg = location.hash.slice(1).split('/')[1];
    const tab = curTab();
    markTab();
    view.innerHTML = '<p class="muted">Lädt …</p>';
    const fn = { kalender: calendarView, anfragen: requestsView, schueler: arg ? () => studentDetail(arg) : studentsView, rechnungen: invoicesView, einstellungen: settingsView }[tab];
    fn().catch((e) => { console.error(e); view.innerHTML = `<div class="empty">Fehler beim Laden: ${esc(e.message)}</div>`; });
  }
  const reload = () => { refreshBadge(); route(); };

  // ---------- Hilfen ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const nowStr = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const STATUS = { booked: 'Geplant', done: 'Erledigt', cancelled: 'Abgesagt' };
  const INV = { open: 'Offen', paid: 'Bezahlt', cancelled: 'Storniert', overdue: 'Überfällig' };
  const name = (o) => `${o.first_name || ''} ${o.last_name || ''}`.trim();
  const activeTypes = () => S.lessonTypes.filter((l) => l.active);
  const ltOptions = (sel) => activeTypes().map((l) => `<option value="${l.id}" ${l.id == sel ? 'selected' : ''}>${l.minutes} Min. – CHF ${App.chf(l.price)}</option>`).join('');
  const waStudent = (phone, text, label = 'WhatsApp') => phone ? `<a class="btn btn-ghost btn-sm" href="${App.waLink(phone, text)}" target="_blank" rel="noopener">${label}</a>` : '';
  const siteUrl = () => location.origin.startsWith('http') && !location.origin.includes('claude') ? location.origin : 'unserer Webseite';
  const apptText = (s, first) => `Hallo ${first}, dein Fahrstunden-Termin: ${App.dayTitle(s.start_at)}, ${App.time(s.start_at)}–${App.endTime(s.start_at, s.minutes)} Uhr (${s.minutes} Min.).`
    + (s.meeting_point ? ` Treffpunkt: ${s.meeting_point}.` : '') + ` Du findest ihn auch in deinem Konto auf ${siteUrl()}. Bis dann!`;
  async function loadStudents() { students = (await App.api('GET', '/api/admin/students')).filter((s) => s.role === 'student'); return students; }

  // ---------- Termin erstellen / bearbeiten ----------
  async function apptModal({ appt, userId, orderId, date, time } = {}) {
    if (!students.length) await loadStudents();
    const orders = await App.api('GET', '/api/admin/orders');
    const isEdit = !!appt;
    const uid = appt?.user_id || userId || '';
    const ordersFor = (id) => orders.filter((o) => o.user_id == id);
    const orderOpts = (id, sel) => `<option value="">– ohne Bezug zu einer Buchung –</option>` + ordersFor(id).map((o) =>
      `<option value="${o.id}" data-lt="${o.lesson_type_id}" ${o.id == sel ? 'selected' : ''}>${o.qty} × ${o.minutes} Min. (noch ${o.remaining} offen)</option>`).join('');
    const firstOrder = ordersFor(uid)[0];
    const selOrder = orderId || (!isEdit && firstOrder ? firstOrder.id : '');
    const selLt = appt?.lesson_type_id || orders.find((o) => o.id == selOrder)?.lesson_type_id || activeTypes()[0]?.id;
    App.modal(`
      <h2>${isEdit ? 'Termin bearbeiten' : 'Termin senden'}</h2>
      <form id="af">
        <div class="field"><label>Schüler</label>
          <select name="user_id" required ${isEdit ? 'disabled' : ''}><option value="">– wählen –</option>
            ${students.filter((s) => s.active || s.id == uid).map((s) => `<option value="${s.id}" ${s.id == uid ? 'selected' : ''}>${esc(name(s))}${s.lessons_requested ? ` · ${s.lessons_requested} Lektion(en) offen` : ''}</option>`).join('')}
          </select></div>
        ${isEdit ? '' : `<div class="field"><label>Gebuchte Lektionen</label><select name="order_id">${orderOpts(uid, selOrder)}</select></div>`}
        <div class="row">
          <div class="field"><label>Datum</label><input type="date" name="date" required value="${appt ? appt.start_at.slice(0, 10) : (date || ymd(new Date(Date.now() + 864e5)))}"></div>
          <div class="field"><label>Zeit</label><input type="time" name="start" step="300" required value="${appt ? appt.start_at.slice(11, 16) : (time || '17:00')}"></div>
        </div>
        <div class="field"><label>Lektion</label><select name="lesson_type_id">${ltOptions(selLt)}</select></div>
        <div class="field"><label>Treffpunkt</label><input name="meeting_point" value="${esc(appt?.meeting_point || '')}" placeholder="${esc(S.settings.default_meeting_point)}"></div>
        <div class="field"><label>Nachricht an den Schüler (optional, sieht er im Konto)</label><textarea name="message" rows="2" maxlength="1000">${esc(appt?.message || '')}</textarea></div>
        <div class="form-error"></div>
        <div class="acts"><button type="button" class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-cyan">${isEdit ? 'Speichern' : 'Termin senden'}</button></div>
      </form>`,
    (m, close) => {
      const f = m.querySelector('#af');
      const us = f.user_id, os = f.order_id;
      us.addEventListener('change', () => { if (os) { os.innerHTML = orderOpts(us.value, ordersFor(us.value)[0]?.id); os.dispatchEvent(new Event('change')); } });
      os?.addEventListener('change', () => { const lt = os.selectedOptions[0]?.dataset.lt; if (lt) f.lesson_type_id.value = lt; });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const b = Object.fromEntries(new FormData(f));
        if (!isEdit && !b.user_id) { f.querySelector('.form-error').textContent = 'Bitte einen Schüler wählen.'; return; }
        try {
          if (isEdit) await App.api('PUT', '/api/admin/appointments/' + appt.id, b);
          else await App.api('POST', '/api/admin/appointments', b);
          close();
          const st = students.find((s) => s.id == (b.user_id || uid));
          const lt = S.lessonTypes.find((l) => l.id == b.lesson_type_id);
          const s = { start_at: `${b.date}T${b.start}`, minutes: lt.minutes, meeting_point: b.meeting_point || S.settings.default_meeting_point };
          sentModal(st, s, isEdit);
          reload();
        } catch { f.querySelector('.form-error').textContent = 'Bitte Datum, Zeit und Lektion prüfen.'; }
      });
    });
  }

  function sentModal(st, s, isEdit) {
    const text = apptText(s, st?.first_name || '');
    App.modal(`
      <h2>${isEdit ? 'Termin geändert' : 'Termin gesendet'}</h2>
      <p>Der Termin erscheint jetzt im Konto von <strong>${esc(name(st || {}))}</strong>. Willst du ihn zusätzlich per WhatsApp bestätigen?</p>
      <div class="note-box">${esc(text)}</div>
      <div class="acts"><button class="btn btn-ghost" data-close>Schliessen</button>
        ${st?.phone ? `<a class="btn btn-cyan" href="${App.waLink(st.phone, text)}" target="_blank" rel="noopener" data-close>Per WhatsApp senden</a>` : ''}</div>`);
  }

  function apptDetail(s) {
    const past = s.start_at < nowStr();
    App.modal(`
      <h2>${esc(name(s))}</h2>
      <p style="margin-top:-6px"><span class="badge ${s.status}">${STATUS[s.status]}</span></p>
      <p><strong>${esc(App.dayTitle(s.start_at))}</strong><br>${App.time(s.start_at)}–${App.endTime(s.start_at, s.minutes)} Uhr · ${s.minutes} Min. · CHF ${App.chf(s.price)}</p>
      ${s.meeting_point ? `<p class="muted" style="margin:-6px 0 10px">Treffpunkt: ${esc(s.meeting_point)}</p>` : ''}
      ${s.message ? `<div class="note-box">${esc(s.message)}</div>` : ''}
      ${s.phone ? `<p class="muted">Telefon: ${esc(s.phone)}</p>` : ''}
      <div class="acts" style="flex-wrap:wrap">
        <a class="btn btn-ghost btn-sm" href="#schueler/${s.user_id}" data-close>Schüler</a>
        ${waStudent(s.phone, apptText(s, s.first_name))}
        ${s.status === 'booked' ? `<button class="btn btn-danger btn-sm" data-cancel>Absagen</button><button class="btn btn-ghost btn-sm" data-edit>Ändern</button>
          <button class="btn ${past ? 'btn-cyan' : ''} btn-sm" data-done>Erledigt</button>` : ''}
      </div>`,
    (m, close) => {
      m.querySelector('[data-edit]')?.addEventListener('click', () => { close(); apptModal({ appt: s }); });
      m.querySelector('[data-done]')?.addEventListener('click', () => { close(); doneModal(s); });
      m.querySelector('[data-cancel]')?.addEventListener('click', async () => {
        close();
        if (!(await App.confirm(`Termin mit ${name(s)} am ${App.date(s.start_at)} absagen? Die Lektion wird wieder als «ohne Termin» geführt.`, 'Absagen'))) return;
        await App.api('DELETE', '/api/admin/appointments/' + s.id); App.toast('Termin abgesagt.'); reload();
      });
    });
  }

  function doneModal(s) {
    App.modal(`
      <h2>Fahrstunde erledigt</h2>
      <p><strong>${esc(name(s))}</strong><br>${esc(App.dayTitle(s.start_at))}, ${App.time(s.start_at)} · ${s.minutes} Min.</p>
      <label class="check"><input type="checkbox" id="dinv" ${S.settings.auto_invoice === '1' ? 'checked' : ''}> Rechnung erstellen (CHF ${App.chf(s.price)})</label>
      <p class="muted" style="font-size:13px">Bei der ersten Rechnung eines Schülers wird die Administrations- und Versicherungsgebühr automatisch dazugerechnet.</p>
      <div class="acts"><button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-cyan" id="dok">Erledigt</button></div>`,
    (m, close) => m.querySelector('#dok').addEventListener('click', async () => {
      const r = await App.api('POST', `/api/admin/appointments/${s.id}/done`, { invoice: m.querySelector('#dinv').checked });
      close(); App.toast(r.invoiceId ? 'Erledigt – Rechnung erstellt.' : 'Erledigt.'); reload();
    }));
  }

  // ---------------- Kalender ----------------
  let weekStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  async function calendarView() {
    const days = [...Array(7)].map((_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
    const from = ymd(days[0]), to = ymd(days[6]);
    const [week, pendingAll, orders, upcoming] = await Promise.all([
      App.api('GET', `/api/admin/slots?from=${from}&to=${to}`),
      App.api('GET', `/api/admin/slots?from=${ymd(new Date(Date.now() - 90 * 864e5))}&to=${ymd(new Date())}`),
      App.api('GET', '/api/admin/orders'), App.api('GET', `/api/admin/slots?from=${ymd(new Date())}`), loadStudents()]);
    const now = nowStr();
    const next = upcoming.find((s) => s.status === 'booked' && s.start_at >= now);
    const pending = pendingAll.filter((s) => s.status === 'booked' && s.start_at < now);
    const requested = orders.reduce((s, o) => s + o.remaining, 0);
    const todayStr = ymd(new Date());
    const H = 52; // Pixel pro Stunde
    let startH = 7, endH = 21;
    week.forEach((s) => { const h = +s.start_at.slice(11, 13); startH = Math.min(startH, h); endH = Math.max(endH, Math.ceil(h + s.minutes / 60 + +s.start_at.slice(14, 16) / 60)); });
    const top = (hm) => { const [h, m] = hm.split(':').map(Number); return ((h - startH) + m / 60) * H; };
    const fmtRange = `${days[0].toLocaleDateString('de-CH', { day: 'numeric', month: 'long' })} – ${days[6].toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    const mobile = matchMedia('(max-width: 760px)').matches;

    const evHtml = (s) => {
      const cls = s.status === 'done' ? 'done' : (s.start_at < now ? 'past' : '');
      return `<div class="cal-ev ${cls}" data-ev="${s.id}" style="top:${top(s.start_at.slice(11, 16))}px;height:${Math.max(22, s.minutes / 60 * H - 2)}px">
        <b>${App.time(s.start_at)} ${esc(name(s))}</b>${s.minutes} Min.${s.meeting_point && s.minutes >= 70 ? `<br>${esc(s.meeting_point)}` : ''}</div>`;
    };
    const grid = mobile ? days.map((d) => {
      const list = week.filter((s) => s.start_at.startsWith(ymd(d)));
      return `<div class="day-group"><div class="day-head">${esc(App.dayTitle(ymd(d)))}</div>
        ${list.length ? list.map((s) => `<div class="slot ${s.status === 'done' ? 'done' : 'booked'}" data-ev="${s.id}" style="cursor:pointer">
          <div class="time">${App.time(s.start_at)}<small>bis ${App.endTime(s.start_at, s.minutes)}</small></div>
          <div class="meta"><span class="who">${esc(name(s))}</span> <span class="muted">· ${s.minutes} Min.</span></div><div class="acts"><span class="badge ${s.status}">${STATUS[s.status]}</span></div></div>`).join('')
          : `<div class="day-empty">Keine Termine <button class="btn btn-ghost btn-sm" data-newday="${ymd(d)}">+ Termin</button></div>`}</div>`;
    }).join('') : `
      <div class="cal" style="--h:${H}px">
        <div style="border-bottom:2px solid var(--ink)"></div>
        ${days.map((d) => `<div class="cal-dayname ${ymd(d) === todayStr ? 'today' : ''}">${d.toLocaleDateString('de-CH', { weekday: 'short' })}<b>${d.getDate()}</b></div>`).join('')}
        <div class="cal-times" style="height:${(endH - startH) * H}px">${[...Array(endH - startH)].map((_, i) => i ? `<span style="top:${i * H}px">${pad(startH + i)}:00</span>` : '').join('')}</div>
        ${days.map((d) => `<div class="cal-col ${ymd(d) === todayStr ? 'today' : ''}" data-day="${ymd(d)}" style="height:${(endH - startH) * H}px">
          ${ymd(d) === todayStr && now.slice(11) > pad(startH) && now.slice(11) < pad(endH) ? `<div class="cal-now" style="top:${top(now.slice(11, 16))}px"></div>` : ''}
          ${week.filter((s) => s.start_at.startsWith(ymd(d))).map(evHtml).join('')}</div>`).join('')}
      </div>
      <p class="muted" style="font-size:13px;margin-top:8px">Tipp: In eine freie Stelle im Kalender klicken, um dort einen Termin zu erstellen.</p>`;

    view.innerHTML = `
      <div class="grid g3 stats3" style="margin-bottom:20px">
        <a class="card stat accent" href="#anfragen" style="text-decoration:none"><b>${requested}</b><span>Lektionen ohne Termin</span></a>
        ${next ? `<button class="card stat" data-next style="text-align:left;cursor:pointer;font:inherit;color:inherit"><b>${App.time(next.start_at)}</b><small>${esc(App.date(next.start_at, { weekday: 'short', day: 'numeric', month: 'numeric' }))} · ${esc(name(next))}</small><span>Nächster Termin</span></button>`
          : '<div class="card stat"><b>–</b><span>Nächster Termin</span></div>'}
        <div class="card stat"><b>${pending.length}</b><span>Noch als erledigt markieren</span></div>
      </div>
      ${pending.length ? `<div class="card" style="margin-bottom:20px;border-left:5px solid var(--warn)"><h3>Vergangene Termine – erledigt?</h3>
        ${pending.map((s) => `<div class="order-row"><span><strong>${esc(name(s))}</strong> <span class="muted">· ${App.date(s.start_at)} ${App.time(s.start_at)} · ${s.minutes} Min.</span></span>
          <span><button class="btn btn-cyan btn-sm" data-pdone="${s.id}">Erledigt</button> <button class="btn btn-ghost btn-sm" data-pev="${s.id}">Details</button></span></div>`).join('')}</div>` : ''}
      <div class="cal-head">
        <h2>${fmtRange}</h2>
        <button class="btn btn-ghost btn-sm" data-nav="-1" aria-label="Vorherige Woche">‹</button>
        <button class="btn btn-ghost btn-sm" data-nav="0">Heute</button>
        <button class="btn btn-ghost btn-sm" data-nav="1" aria-label="Nächste Woche">›</button>
        <button class="btn btn-cyan btn-sm" data-new>+ Termin</button>
      </div>
      ${grid}`;

    view.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
      const n = +b.dataset.nav;
      if (n === 0) { weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); }
      else weekStart.setDate(weekStart.getDate() + 7 * n);
      calendarView();
    });
    view.querySelector('[data-new]').onclick = () => apptModal();
    view.querySelector('[data-next]')?.addEventListener('click', () => apptDetail(next));
    const all = [...week, ...pending];
    view.querySelectorAll('[data-ev],[data-pev]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); apptDetail(all.find((s) => s.id == (el.dataset.ev || el.dataset.pev))); }));
    view.querySelectorAll('[data-pdone]').forEach((b) => b.onclick = () => doneModal(pending.find((s) => s.id == b.dataset.pdone)));
    view.querySelectorAll('[data-newday]').forEach((b) => b.onclick = () => apptModal({ date: b.dataset.newday }));
    view.querySelectorAll('.cal-col').forEach((col) => col.addEventListener('click', (e) => {
      if (e.target.closest('.cal-ev')) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      const mins = Math.round((startH * 60 + (y / H) * 60) / 15) * 15;
      apptModal({ date: col.dataset.day, time: `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` });
    }));
  }

  // ---------------- Anfragen ----------------
  async function requestsView() {
    const orders = await refreshBadge();
    view.innerHTML = `
      <div class="grid" style="grid-template-columns: 1fr 340px; align-items:start" id="rqGrid">
        <div>
          <h2 class="display" style="font-size:34px">Gebuchte Lektionen ohne Termin</h2>
          ${orders.length ? orders.map((o) => `
            <div class="req">
              <div>
                <a class="who" href="#schueler/${o.user_id}">${esc(name(o))}</a> <span class="muted">· ${esc(o.phone || 'keine Nummer')}</span>
                <div><strong>${o.qty} × ${o.minutes} Min.</strong> <span class="muted">· gebucht am ${App.date(o.created_at.slice(0, 10))}</span>
                  ${o.scheduled ? `<span class="badge open">${o.scheduled} terminiert</span>` : ''} <span class="badge warn">${o.remaining} offen</span></div>
                ${o.note ? `<div class="note-box">${esc(o.note)}</div>` : ''}
              </div>
              <div class="acts">
                ${waStudent(o.phone, `Hallo ${o.first_name}, danke für deine Buchung (${o.qty} × ${o.minutes} Min.). Wann passt es dir für die nächste Fahrstunde?`)}
                <button class="btn btn-cyan btn-sm" data-send="${o.id}" data-user="${o.user_id}">Termin senden</button>
                <button class="btn btn-ghost btn-sm" data-close-order="${o.id}" title="Restliche Lektionen nicht mehr einplanen">Abschliessen</button>
              </div>
            </div>`).join('') : '<div class="empty">Keine offenen Anfragen. Neue Buchungen von Schülern erscheinen hier.</div>'}
        </div>
        <div class="card"><h3>So läuft’s</h3><ol class="how">
          <li>Schüler bucht Lektionen im Konto</li><li>Termin per WhatsApp abmachen</li><li>Hier «Termin senden» – er erscheint im Konto des Schülers und im Kalender</li><li>Nach der Fahrstunde «Erledigt» → Rechnung</li></ol></div>
      </div>`;
    if (matchMedia('(max-width: 900px)').matches) view.querySelector('#rqGrid').style.gridTemplateColumns = '1fr';
    view.querySelectorAll('[data-send]').forEach((b) => b.onclick = () => apptModal({ userId: +b.dataset.user, orderId: +b.dataset.send }));
    view.querySelectorAll('[data-close-order]').forEach((b) => b.onclick = async () => {
      if (!(await App.confirm('Diese Buchung abschliessen? Noch nicht terminierte Lektionen werden nicht mehr eingeplant.', 'Abschliessen'))) return;
      await App.api('POST', `/api/admin/orders/${b.dataset.closeOrder}/close`); reload();
    });
  }

  // ---------------- Schüler ----------------
  async function studentsView() {
    const list = await loadStudents();
    view.innerHTML = `
      <div class="card">
        <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px">
          <h2 style="margin:0">Schüler</h2>
          <input class="inp" id="q" placeholder="Suchen …" style="max-width:280px">
        </div>
        <table class="list"><thead><tr><th>Name</th><th class="hide-sm">Telefon</th><th class="num">Erledigt</th><th class="num">Geplant</th><th class="num hide-sm">Ohne Termin</th><th class="num">Offen CHF</th></tr></thead>
        <tbody id="tb"></tbody></table>
      </div>`;
    const tb = view.querySelector('#tb');
    const draw = (q = '') => {
      const f = list.filter((s) => (name(s) + s.email + s.phone).toLowerCase().includes(q.toLowerCase()));
      tb.innerHTML = f.map((s) => `<tr class="click" data-id="${s.id}">
        <td><strong>${esc(name(s) || '–')}</strong> ${!s.active ? '<span class="badge cancelled">Inaktiv</span>' : ''}<div class="muted" style="font-size:13px">${esc(s.email)}</div></td>
        <td class="hide-sm">${esc(s.phone)}</td><td class="num">${s.lessons_done}</td><td class="num">${s.lessons_booked || '–'}</td>
        <td class="num hide-sm">${s.lessons_requested ? `<span class="badge warn">${s.lessons_requested}</span>` : '–'}</td>
        <td class="num">${s.open_amount ? App.chf(s.open_amount) : '–'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Noch keine Schüler. Schüler registrieren sich selbst über «Login → Registrieren».</td></tr>';
    };
    draw();
    view.querySelector('#q').addEventListener('input', (e) => draw(e.target.value));
    tb.addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) location.hash = 'schueler/' + r.dataset.id; });
  }

  async function studentDetail(id) {
    const d = await App.api('GET', '/api/admin/students/' + id);
    const u = d.user;
    const f = (n, l, type = 'text') => `<div class="field"><label>${l}</label><input name="${n}" type="${type}" value="${esc(u[n] || '')}"></div>`;
    const now = nowStr();
    view.innerHTML = `
      <p><a href="#schueler">← Alle Schüler</a></p>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:20px">
        <h2 class="display" style="font-size:44px;margin:0">${esc(name(u))}</h2>
        ${!u.active ? '<span class="badge cancelled">Inaktiv</span>' : ''}
        <span class="muted">${esc(u.email)} · ${esc(u.phone || '–')} · seit ${App.date(u.created_at.slice(0, 10))}</span>
        <span style="margin-left:auto;display:flex;gap:8px">${waStudent(u.phone, `Hallo ${u.first_name}, `)}<button class="btn btn-cyan btn-sm" id="newAppt">Termin senden</button></span>
      </div>
      <div class="grid g2" style="align-items:start">
        <div class="grid">
          <div class="card">
            <h3>Termine (${d.appointments.filter((b) => b.status === 'done').length} erledigt)</h3>
            ${d.appointments.length ? d.appointments.map((b) => `
              <div class="order-row">
                <span><strong>${App.date(b.start_at)}</strong> <span class="muted">${App.time(b.start_at)} · ${b.minutes} Min.</span>
                  <span class="badge ${b.status === 'booked' && b.start_at < now ? 'warn' : b.status}">${b.status === 'booked' && b.start_at < now ? 'Erledigt?' : STATUS[b.status]}</span></span>
                <span><button class="btn btn-ghost btn-sm" data-ap="${b.id}">Details</button></span>
              </div>`).join('') : '<p class="muted">Noch keine Termine.</p>'}
          </div>
          <div class="card">
            <h3>Gebuchte Lektionen</h3>
            ${d.orders.length ? d.orders.map((o) => `<div class="order-row"><span><strong>${o.qty} × ${o.minutes} Min.</strong> <span class="muted">· ${App.date(o.created_at.slice(0, 10))}</span>
              ${o.note ? `<div class="muted" style="font-size:14px">«${esc(o.note)}»</div>` : ''}</span>
              <span>${o.status === 'open' ? `<span class="badge warn">${o.remaining} ohne Termin</span>` : '<span class="badge done">alle terminiert</span>'}</span></div>`).join('') : '<p class="muted">Keine Buchungen.</p>'}
          </div>
        </div>
        <div class="grid">
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Rechnungen</h3><button class="btn btn-sm" id="newInv">Neue Rechnung</button></div>
            ${invTable(d.invoices, false)}
          </div>
          <form class="card" id="userForm">
            <h3>Angaben</h3>
            <div class="row">${f('first_name', 'Vorname')}${f('last_name', 'Nachname')}</div>
            <div class="row">${f('phone', 'Handynummer', 'tel')}${f('birthdate', 'Geburtsdatum', 'date')}</div>
            <div class="row">${f('street', 'Strasse, Nr.')}${f('zip_city', 'PLZ, Ort')}</div>
            <div class="field"><label>Neues Passwort setzen (optional)</label><input name="password" type="text" autocomplete="off" placeholder="leer lassen = unverändert"></div>
            <label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} ${u.id === App.user.id ? 'disabled' : ''}> Konto aktiv</label>
            <button class="btn">Speichern</button>
          </form>
        </div>
      </div>`;
    const full = d.appointments.map((b) => ({ ...b, first_name: u.first_name, last_name: u.last_name, phone: u.phone }));
    view.querySelectorAll('[data-ap]').forEach((b) => b.onclick = () => apptDetail(full.find((x) => x.id == b.dataset.ap)));
    view.querySelector('#newAppt').onclick = () => apptModal({ userId: u.id });
    view.querySelector('#userForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(e.target));
      b.active = e.target.active.disabled ? true : e.target.active.checked;
      if (!b.password) delete b.password;
      try { await App.api('PUT', '/api/admin/students/' + id, b); App.toast('Gespeichert.'); students = []; studentDetail(id); }
      catch (ex) { App.toast(ex.code === 'password_short' ? 'Passwort: mindestens 8 Zeichen.' : 'Fehler beim Speichern.', true); }
    });
    bindInvActions(view, () => studentDetail(id));
    view.querySelector('#newInv').addEventListener('click', () => newInvoiceModal(u, () => studentDetail(id)));
  }

  function newInvoiceModal(u, done) {
    const row = (desc = '', price = '') => `<div class="row inv-item" style="grid-template-columns:1fr 110px 36px;align-items:end">
      <div class="field"><label>Beschreibung</label><input name="d" value="${esc(desc)}"></div>
      <div class="field"><label>CHF</label><input name="p" type="number" step="0.05" value="${price}"></div>
      <button type="button" class="btn btn-ghost btn-sm" data-rm style="margin-bottom:14px" aria-label="Entfernen">×</button></div>`;
    App.modal(`<h2>Neue Rechnung</h2><p>für <strong>${esc(name(u))}</strong></p>
      <div id="items">${row()}</div>
      <p><button type="button" class="btn btn-ghost btn-sm" id="addItem">+ Position</button>
         <button type="button" class="btn btn-ghost btn-sm" id="addFee">+ Admin-Gebühr</button>
         ${activeTypes().map((l) => `<button type="button" class="btn btn-ghost btn-sm" data-lt="${l.id}">+ ${l.minutes} Min.</button>`).join(' ')}</p>
      <div class="acts"><button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-cyan" id="iok">Rechnung erstellen</button></div>`,
    (m, close) => {
      const items = m.querySelector('#items');
      const add = (d, p) => { if (items.children.length === 1 && !items.querySelector('[name=d]').value) items.innerHTML = ''; items.insertAdjacentHTML('beforeend', row(d, p)); };
      m.querySelector('#addItem').onclick = () => items.insertAdjacentHTML('beforeend', row());
      m.querySelector('#addFee').onclick = () => add('Einmalige Administrations- und Versicherungsgebühr', S.settings.admin_fee);
      m.querySelectorAll('[data-lt]').forEach((b) => b.onclick = () => { const l = S.lessonTypes.find((x) => x.id == b.dataset.lt); add(`Fahrstunde ${l.minutes} Min.`, l.price); });
      items.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) e.target.closest('.inv-item').remove(); });
      m.querySelector('#iok').onclick = async () => {
        const list = [...items.querySelectorAll('.inv-item')].map((r) => ({ description: r.querySelector('[name=d]').value, unit_price: r.querySelector('[name=p]').value, qty: 1 }));
        try { const r = await App.api('POST', '/api/admin/invoices', { user_id: u.id, items: list }); close(); App.toast(`Rechnung ${r.id ? '' : ''}erstellt.`); done(); }
        catch { App.toast('Bitte mindestens eine Position ausfüllen.', true); }
      };
    });
  }

  // ---------------- Rechnungen ----------------
  function invTable(invs, withName) {
    if (!invs.length) return '<p class="muted">Keine Rechnungen.</p>';
    return `<table class="list"><thead><tr><th>Nr.</th>${withName ? '<th>Schüler</th>' : ''}<th class="hide-sm">Datum</th><th class="hide-sm">Fällig</th><th class="num">Betrag</th><th>Status</th><th></th></tr></thead><tbody>
      ${invs.map((i) => { const st = App.isOverdue(i) ? 'overdue' : i.status; return `<tr>
        <td>${esc(i.number)}</td>${withName ? `<td><a href="#schueler/${i.user_id}">${esc(name(i))}</a></td>` : ''}
        <td class="hide-sm">${App.date(i.created_at)}</td><td class="hide-sm">${App.date(i.due_at)}</td>
        <td class="num">${App.chf(i.total)}</td><td><span class="badge ${st}">${INV[st]}</span></td>
        <td class="num" style="white-space:nowrap">
          <a class="btn btn-ghost btn-sm" href="rechnung.html#${i.id}">Ansehen</a>
          ${i.status === 'open' ? `<button class="btn btn-sm" data-paid="${i.id}">Bezahlt</button>` : ''}
          ${i.status === 'paid' ? `<button class="btn btn-ghost btn-sm" data-reopen="${i.id}">Offen</button>` : ''}
          ${i.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm" data-storno="${i.id}" title="Stornieren" aria-label="Stornieren">×</button>` : ''}
        </td></tr>`; }).join('')}</tbody></table>`;
  }
  function bindInvActions(root, done) {
    const set = (id, status) => App.api('PUT', `/api/admin/invoices/${id}/status`, { status }).then(done);
    root.querySelectorAll('[data-paid]').forEach((b) => b.onclick = () => set(b.dataset.paid, 'paid'));
    root.querySelectorAll('[data-reopen]').forEach((b) => b.onclick = () => set(b.dataset.reopen, 'open'));
    root.querySelectorAll('[data-storno]').forEach((b) => b.onclick = async () => (await App.confirm('Rechnung stornieren?', 'Stornieren')) && set(b.dataset.storno, 'cancelled'));
  }
  let invFilter = 'open';
  async function invoicesView() {
    const all = await App.api('GET', '/api/admin/invoices');
    const list = all.filter((i) => invFilter === 'all' || (invFilter === 'overdue' ? App.isOverdue(i) : i.status === invFilter));
    const sum = (arr) => arr.reduce((s, i) => s + i.total, 0);
    view.innerHTML = `
      <div class="grid g3" style="margin-bottom:20px">
        <div class="card stat accent"><b>${App.chf(sum(all.filter((i) => i.status === 'open')))}</b><span>Offen (CHF)</span></div>
        <div class="card stat"><b>${App.chf(sum(all.filter((i) => App.isOverdue(i))))}</b><span>Überfällig (CHF)</span></div>
        <div class="card stat"><b>${App.chf(sum(all.filter((i) => i.status === 'paid' && i.paid_at?.startsWith(String(new Date().getFullYear())))))}</b><span>Bezahlt dieses Jahr</span></div>
      </div>
      <div class="card">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          ${[['open', 'Offen'], ['overdue', 'Überfällig'], ['paid', 'Bezahlt'], ['cancelled', 'Storniert'], ['all', 'Alle']].map(([k, l]) => `<button class="btn btn-sm ${invFilter === k ? '' : 'btn-ghost'}" data-f="${k}">${l}</button>`).join('')}
        </div>
        ${invTable(list, true)}
        <p class="muted" style="font-size:14px;margin-top:14px">Rechnungen entstehen automatisch, wenn du einen Termin als «Erledigt» markierst – oder manuell beim Schüler.</p>
      </div>`;
    view.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { invFilter = b.dataset.f; invoicesView(); });
    bindInvActions(view, invoicesView);
  }

  // ---------------- Einstellungen ----------------
  async function settingsView() {
    S = await App.api('GET', '/api/admin/settings');
    const st = S.settings;
    const f = (k, l, type = 'text', extra = '') => `<div class="field"><label>${l}</label><input name="${k}" type="${type}" value="${esc(st[k] ?? '')}" ${extra}></div>`;
    view.innerHTML = `
      <div class="grid g2" style="align-items:start">
        <div class="grid">
          <div class="card">
            <h3>Lektionen & Preise</h3>
            <table class="list"><thead><tr><th>Dauer (Min.)</th><th>Preis CHF</th><th>Aktiv</th><th></th></tr></thead><tbody>
              ${S.lessonTypes.map((l) => `<tr data-lt="${l.id}"><td><input class="inp" name="minutes" type="number" value="${l.minutes}" style="width:90px"></td>
                <td><input class="inp" name="price" type="number" step="0.05" value="${l.price}" style="width:110px"></td>
                <td><input type="checkbox" name="active" ${l.active ? 'checked' : ''} aria-label="Aktiv"></td>
                <td><button class="btn btn-sm" data-save-lt>Speichern</button></td></tr>`).join('')}
            </tbody></table>
            <p style="margin-top:14px"><button class="btn btn-ghost btn-sm" id="addLt">+ Lektionsart hinzufügen</button></p>
            <p class="muted" style="font-size:13px">Preise kannst du auch direkt auf der Webseite im Editor-Modus ändern.</p>
          </div>
          <form class="card" id="genForm">
            <h3>Allgemein</h3>
            <div class="row">${f('admin_fee', 'Admin-/Versicherungsgebühr CHF', 'number')}${f('invoice_due_days', 'Zahlungsfrist (Tage)', 'number')}</div>
            ${f('default_meeting_point', 'Standard-Treffpunkt')}
            <label class="check"><input type="checkbox" name="auto_invoice" ${st.auto_invoice === '1' ? 'checked' : ''}> Beim «Erledigt» automatisch eine Rechnung erstellen</label>
            <button class="btn btn-cyan">Speichern</button>
          </form>
        </div>
        <div class="grid">
        <form class="card" id="qrForm">
          <h3>Rechnungsangaben (QR-Rechnung)</h3>
          <p class="muted" style="font-size:14px">Mit IBAN und Adresse bekommt jede Rechnung automatisch einen Schweizer QR-Einzahlungsschein.</p>
          ${f('creditor_name', 'Name / Firma')}${f('creditor_street', 'Strasse, Nr.')}
          <div class="row">${f('creditor_zip', 'PLZ')}${f('creditor_city', 'Ort')}</div>
          ${f('iban', 'IBAN oder QR-IBAN', 'text', 'placeholder="CH.. .... .... .... .... ."')}
          <button class="btn btn-cyan">Speichern</button>
        </form>
        <form class="card" id="pwForm">
          <h3>Mein Passwort ändern</h3>
          <div class="field"><label>Aktuelles Passwort</label><input name="current" type="password" autocomplete="current-password" required></div>
          <div class="field"><label>Neues Passwort (mindestens 8 Zeichen)</label><input name="next" type="password" autocomplete="new-password" minlength="8" required></div>
          <div class="form-error" role="alert"></div>
          <button class="btn">Passwort ändern</button>
        </form>
        </div>
      </div>`;
    view.querySelector('#pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = e.target.querySelector('.form-error'); err.textContent = '';
      try { await App.api('POST', '/api/me/password', Object.fromEntries(new FormData(e.target))); e.target.reset(); App.toast('Passwort geändert.'); }
      catch (ex) { err.textContent = App.errText(ex); }
    });
    view.querySelectorAll('[data-save-lt]').forEach((b) => b.onclick = async () => {
      const tr = b.closest('tr');
      try {
        await App.api('PUT', '/api/admin/lesson-types/' + tr.dataset.lt, { minutes: tr.querySelector('[name=minutes]').value, price: tr.querySelector('[name=price]').value, active: tr.querySelector('[name=active]').checked });
        App.toast('Gespeichert.'); S = await App.api('GET', '/api/admin/settings');
      } catch { App.toast('Ungültige Werte.', true); }
    });
    view.querySelector('#addLt').onclick = () => App.modal(`<h2>Neue Lektionsart</h2>
        <div class="row"><div class="field"><label>Dauer (Min.)</label><input id="nm" type="number" value="100"></div>
        <div class="field"><label>Preis CHF</label><input id="np" type="number" step="0.05" value="180"></div></div>
        <div class="acts"><button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-cyan" id="nok">Hinzufügen</button></div>`,
    (m, close) => m.querySelector('#nok').addEventListener('click', async () => {
      try { await App.api('POST', '/api/admin/lesson-types', { minutes: m.querySelector('#nm').value, price: m.querySelector('#np').value }); close(); settingsView(); }
      catch { App.toast('Ungültige Werte.', true); }
    }));
    const saveForm = (sel, extra) => view.querySelector(sel).addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(e.target)); if (extra) extra(b, e.target);
      await App.api('PUT', '/api/admin/settings', b); App.toast('Gespeichert.'); S = await App.api('GET', '/api/admin/settings');
    });
    saveForm('#genForm', (b, fm) => { b.auto_invoice = fm.auto_invoice.checked ? 1 : 0; });
    saveForm('#qrForm');
  }

  await refreshBadge();
  route();
})();
