// Rechnung ansehen und drucken, mit Schweizer Zahlteil wenn IBAN und Adresse hinterlegt sind.
// Die Rechnung selbst ist immer auf Deutsch.
(async function () {
  const { esc } = App;
  const root = document.getElementById('invoice');
  const user = await App.loadUser();
  if (!user) { location.href = 'login.html'; return; }
  App.renderHeader({ app: true });
  const back = user.role === 'admin' ? 'admin.html#rechnungen' : 'konto.html#rechnungen';
  const fail = () => { root.innerHTML = `<div class="empty">${App.t('err.generic')} <a href="${back}">${App.t('tab.invoices')}</a></div>`; };

  let d;
  try { d = await App.api('GET', '/api/invoices/' + Number(location.hash.slice(1))); } catch { return fail(); }
  const { invoice: inv, creditor: c, debtor: u, qrSvg, reference } = d;
  const fmt = (n) => Number(n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const iban = (s) => String(s).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
  const ref = (s) => s && `${s.slice(0, 2)} ${s.slice(2).replace(/(.{5})/g, '$1 ').trim()}`;
  const sender = c.name ? [c.name, c.street, `${c.zip} ${c.city}`.trim()].filter(Boolean) : ['Fahrschule Meier'];
  const STATUS = { open: 'Offen', paid: 'Bezahlt', cancelled: 'Storniert' };
  const addr = (lines) => lines.filter(Boolean).map(esc).join('<br>');
  const payee = addr([iban(c.iban), c.name, c.street, `${c.zip} ${c.city}`.trim()]);
  const payer = addr([u.name, u.street, u.zip_city]);
  const message = `Rechnung ${inv.number}`;

  root.innerHTML = `
    <div class="invoice-tools no-print">
      <a class="more" href="${back}">← ${App.t('tab.invoices')}</a>
      <button class="btn btn-sm" id="printBtn">Drucken oder als PDF sichern</button>
    </div>
    <article class="invoice">
      <header class="inv-head">
        <img src="img/logo-dark.png" alt="Fahrschule Meier" width="523" height="159">
        <address>${addr(sender)}</address>
      </header>
      <address class="inv-to">${addr([u.name, u.street, u.zip_city])}</address>
      <h1>Rechnung ${esc(inv.number)}</h1>
      <dl class="inv-meta">
        <div><dt>Datum</dt><dd>${App.date(inv.created_at)}</dd></div>
        <div><dt>Zahlbar bis</dt><dd>${App.date(inv.due_at)}</dd></div>
        <div><dt>Status</dt><dd>${STATUS[inv.status]}${inv.paid_at ? `, ${App.date(inv.paid_at)}` : ''}</dd></div>
      </dl>
      <table class="inv-items">
        <thead><tr><th>Beschreibung</th><th class="num">Anzahl</th><th class="num">CHF</th></tr></thead>
        <tbody>${inv.items.map((i) => `<tr><td>${esc(i.description)}</td><td class="num">${i.qty}</td><td class="num">${fmt(i.unit_price * i.qty)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="2">Total</th><th class="num">CHF ${fmt(inv.total)}</th></tr></tfoot>
      </table>
    </article>
    ${qrSvg && inv.status === 'open' ? `
    <section class="qrbill" aria-label="Zahlteil">
      <div class="qr-receipt">
        <h2>Empfangsschein</h2>
        <h3>Konto / Zahlbar an</h3><p>${payee}</p>
        ${reference ? `<h3>Referenz</h3><p>${esc(ref(reference))}</p>` : ''}
        <h3>Zahlbar durch</h3><p>${payer}</p>
        <div class="qr-sum"><div><h3>Währung</h3><p>CHF</p></div><div><h3>Betrag</h3><p>${fmt(inv.total).replace(/[’']/g, ' ')}</p></div></div>
        <p class="qr-accept">Annahmestelle</p>
      </div>
      <div class="qr-pay">
        <div class="qr-left">
          <h2>Zahlteil</h2>
          <div class="qr-code">${qrSvg}</div>
          <div class="qr-sum"><div><h3>Währung</h3><p>CHF</p></div><div><h3>Betrag</h3><p>${fmt(inv.total).replace(/[’']/g, ' ')}</p></div></div>
        </div>
        <div class="qr-right">
          <h3>Konto / Zahlbar an</h3><p>${payee}</p>
          ${reference ? `<h3>Referenz</h3><p>${esc(ref(reference))}</p>` : ''}
          <h3>Zusätzliche Informationen</h3><p>${esc(message)}</p>
          <h3>Zahlbar durch</h3><p>${payer}</p>
        </div>
      </div>
    </section>` : ''}`;
  document.getElementById('printBtn').addEventListener('click', () => window.print());
})();
