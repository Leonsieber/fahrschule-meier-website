// Einstieg auf Vercel. vercel.json leitet alle /api/...-Adressen hierher um.
import { handle } from '../lib/api.mjs';

export default {
  fetch(req) {
    const url = new URL(req.url);
    const p = url.searchParams.get('__p');
    return handle(req, p !== null ? `/api/${p}` : undefined);
  },
};
