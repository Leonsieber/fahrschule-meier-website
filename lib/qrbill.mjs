// Schweizer QR-Rechnung (Swiss Payment Standards, Version 2.x).
// Der QR-Code entsteht nur, wenn IBAN und Empfängeradresse vollständig sind.
import QRCode from 'qrcode';

export function validIban(iban) {
  const s = String(iban || '').replace(/\s+/g, '').toUpperCase();
  if (!/^(CH|LI)\d{7}[0-9A-Z]{12}$/.test(s)) return false;
  const digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}
// QR-IBANs haben eine Instituts-Nummer von 30000 bis 31999 und verlangen eine QR-Referenz
export const isQrIban = (iban) => { const n = Number(String(iban).slice(4, 9)); return n >= 30000 && n <= 31999; };

function mod10(s) {
  const t = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let c = 0;
  for (const d of s) c = t[(c + Number(d)) % 10];
  return String((10 - c) % 10);
}
export function qrReference(invoiceId) {
  const base = String(invoiceId).padStart(26, '0');
  return base + mod10(base);
}

const clip = (v, n) => String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);
function splitZipCity(s) {
  const m = String(s || '').trim().match(/^(\d{4,5})\s+(.+)$/);
  return m ? { zip: m[1], city: m[2] } : null;
}

export function qrPayload(inv, user, st) {
  const iban = String(st.iban).replace(/\s+/g, '').toUpperCase();
  const qr = isQrIban(iban);
  const dbt = splitZipCity(user.zip_city);
  const debtor = dbt && user.street
    ? ['S', clip(`${user.first_name} ${user.last_name}`, 70), clip(user.street, 70), '', dbt.zip, clip(dbt.city, 35), 'CH']
    : ['', '', '', '', '', '', ''];
  return [
    'SPC', '0200', '1', iban,
    'S', clip(st.creditor_name, 70), clip(st.creditor_street, 70), '', clip(st.creditor_zip, 16), clip(st.creditor_city, 35), 'CH',
    '', '', '', '', '', '', '',
    Number(inv.total).toFixed(2), 'CHF',
    ...debtor,
    qr ? 'QRR' : 'NON', qr ? qrReference(inv.id) : '',
    `Rechnung ${inv.number}`, 'EPD',
  ].join('\r\n');
}

// Schweizerkreuz in der Mitte, 7 mm auf 46 mm wie im Standard vorgegeben
function withCross(svg) {
  const size = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)[1]);
  const box = size * 7 / 46, x = (size - box) / 2, u = box / 32;
  const cross = `<g transform="translate(${x} ${x}) scale(${u})">
    <rect width="32" height="32" fill="#fff"/><rect x="1.5" y="1.5" width="29" height="29" fill="#000"/>
    <rect x="13" y="7" width="6" height="18" fill="#fff"/><rect x="7" y="13" width="18" height="6" fill="#fff"/></g>`;
  return svg.replace('</svg>', `${cross}</svg>`);
}

export async function billData(inv, user, st) {
  const ready = validIban(st.iban) && st.creditor_name && st.creditor_street && st.creditor_zip && st.creditor_city;
  const creditor = { name: st.creditor_name || '', street: st.creditor_street || '', zip: st.creditor_zip || '', city: st.creditor_city || '', iban: st.iban || '' };
  const debtor = { name: `${user.first_name || ''} ${user.last_name || ''}`.trim(), street: user.street || '', zip_city: user.zip_city || '' };
  if (!ready || inv.status === 'cancelled') return { creditor, debtor, qrSvg: null, reference: null };
  const svg = await QRCode.toString(qrPayload(inv, user, st), { type: 'svg', errorCorrectionLevel: 'M', margin: 0 });
  return { creditor, debtor, qrSvg: withCross(svg), reference: isQrIban(String(st.iban)) ? qrReference(inv.id) : null };
}
