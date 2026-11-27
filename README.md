# Invictus web

Dashboard Next.js 16 untuk Invictus. Jalan sebagai server sendiri dan memanggil backend lewat proxy `/api`.

Arsitektur lengkap, cara antar repo bicara, dan env semua repo ada di [ARCHITECTURE.md](ARCHITECTURE.md).

## Jalanin

```bash
npm install
cp .env.example .env    # BACKEND_ORIGIN, PORT
npm run build           # BACKEND_ORIGIN harus sudah di-set di sini
npm start
```

Dev dengan hot reload: `npm run dev` (port 3100). Backend harus jalan di `BACKEND_ORIGIN`. Login sekali lewat `/web` dari bot, buka di `127.0.0.1`.

## Env

| Env | Default | Keterangan |
|---|---|---|
| `BACKEND_ORIGIN` | `http://127.0.0.1:8787` | Port API backend (bukan 8788). Di-bake saat build |
| `PORT` | `3000` | Port `next start` |

## Cara bicara ke backend

- `next.config.ts` me-rewrite `/api/*`, `/healthz`, `/denied.css`, dan link login `/?n=` ke backend. Browser tetap satu origin, jadi cookie dan CSRF jalan tanpa CORS.
- URL lama (`/positions`, `/pnl`, `/wallet`, dan lain-lain) di-alias di `next.config.ts`.
- `proxy.ts` membuat CSP dengan nonce per request. Akibatnya semua route dirender per request.

## Cek

```bash
npm run typecheck
npm test
```
