# Invictus: arsitektur 3 repo

File ini sama persis di ketiga repo. Kalau diubah, ubah di ketiganya.

| Repo | Isi | Jalan sebagai | Port default |
|---|---|---|---|
| [v1-backend](https://github.com/InvictusLP/v1-backend) | API, wallet vault, semua transaksi, Postgres, Redis, data platform, notifikasi Telegram (kirim saja) | `npm run bot` (tsx, tanpa build) | 8787 (API), 8788 (khusus bot, 127.0.0.1) |
| [v1-web](https://github.com/InvictusLP/v1-web) | Dashboard Next.js 16 | `npm run build` lalu `npm start` | 3000 |
| [v1-telegram](https://github.com/InvictusLP/v1-telegram) | Bot Telegram (long poll) | `npm start` (tsx, tanpa build) | tidak listen |

Asal-usulnya: dulu satu repo `enc-rh-lp-bot`. Backend berbasis branch `main` (yang jalan di production), fitur dari branch `rebuild` di-port ke atasnya, web diambil dari `rebuild`. Detailnya di `MIGRATION.md` (repo backend).

Aturan dasar:

- Hanya backend yang pegang DB, Redis, private key, dan RPC untuk transaksi.
- Web dan telegram tidak punya akses DB atau key. Semuanya lewat HTTP ke backend.
- Web dan telegram tidak saling bicara.

## Gambaran

```
  browser / Telegram Mini App
            |
            | HTTPS, satu domain (nginx/Caddy pegang TLS)
            v
  +----------------------------+
  | web        :3000           |   halaman + CSP nonce
  |  /api/*  /?n=  /healthz  --+---------------+
  +----------------------------+               |
                                               | HTTP proxy (rewrite Next)
                                               v
  +----------------------------------------------------------+
  | backend                                                  |
  |  :8787  /api/*        dipanggil web                      |
  |  :8788  /internal/bot/call/:method   dipanggil telegram  |
  |  notifier, watcher, snapshot, data platform              |
  +----------------------------------------------------------+
     |         |          |                 |
  Postgres   Redis   RPC Robinhood / Arc   Telegram Bot API (sendMessage saja)
                                               ^
  +----------------------------+               |
  | telegram                   | --------------+  getUpdates, sendMessage
  |  BACKEND_URL -> :8788      |
  +----------------------------+
```

## Web ke backend

- Browser hanya kenal origin web. Next me-rewrite `/api/*`, `/healthz`, `/denied.css`, dan link login `/?n=<nonce>` ke `BACKEND_ORIGIN`.
- Karena satu origin, cookie session dan CSRF jalan tanpa CORS. Backend memang tidak punya CORS, jangan taruh web dan API di domain berbeda.
- `BACKEND_ORIGIN` di-bake saat `next build`. Ganti alamat backend berarti build ulang web.
- Auth:
  - Cookie `rhlp`, atau `__Host-rhlp` kalau `WEB_PUBLIC_URL` backend https.
  - Di Telegram Mini App, `POST /api/auth/telegram` juga mengembalikan token untuk `Authorization: Bearer`.
- Login dari bot: bot minta nonce ke backend, user buka `<web>/?n=<nonce>`. Backend menukar nonce jadi cookie, lalu redirect ke `/`.
- Semua POST wajib header `x-csrf` (nilainya dari `GET /api/session`).
- Data live lewat SSE `GET /api/stream`. Proxy Next tidak menahan atau gzip stream ini.
- Timeout proxy 300 detik, cukup untuk mint atau close yang menunggu chain.
- CSP dibuat web (`proxy.ts`) dengan nonce baru per request.

## Telegram ke backend

- Satu endpoint: `POST <BACKEND_URL>/internal/bot/call/:method`.
- Endpoint ini ada di listener terpisah (`INTERNAL_HOST:INTERNAL_PORT`, default `127.0.0.1:8788`), tidak pernah di port 8787.
- Header `x-internal-token` harus sama dengan `INTERNAL_TOKEN` backend, minimal 32 karakter. Dicek timing-safe. Salah: 401. Method tidak terdaftar: 404.
- Body dan response memakai codec `wire.ts`. Copy-nya identik di `backend/shared/wire.ts` dan `telegram/src/wire.ts`, jadi kalau diubah, ubah keduanya. Codec ini menjaga `bigint`, `Date`, `Uint8Array`, `Map`, dan `undefined`.
- Response berupa NDJSON:
  - Nol atau lebih frame `{progress}` (langkah transaksi).
  - Lalu tepat satu `{result}` atau `{error}`.
  - Baris kosong tiap 30 detik sebagai heartbeat.
- Error dibangun ulang dengan class yang sama di bot (`instanceof GasTooExpensive` tetap jalan). URL RPC sudah di-scrub dari pesannya.
- Flow transaksi (mint, close, sell, withdraw, revoke) jalan di backend, termasuk lock posisi dan fee. Kalau koneksi bot putus di tengah, transaksi tetap selesai di backend.
- Daftar method ada di `backend/src/botapi/index.ts`.
- Bot membaca konfigurasi chain sekali saat boot (`botConfig`). Kalau konfigurasi chain backend berubah, restart bot.

## Backend ke Telegram

Backend memakai `TELEGRAM_BOT_TOKEN` untuk mengirim saja:

- Push posisi.
- Prompt approval dari web.
- `getMe`.

Backend tidak pernah polling. Tap tombol approval masuk ke bot, lalu bot meneruskannya ke backend lewat method `handleApprovalTap`.

Telegram hanya mengizinkan satu `getUpdates` per token. Jangan jalankan dua bot dengan token yang sama, termasuk proses `enc-rh-lp-bot` lama. Bot dev pakai token sendiri.

## Env per repo

### backend (`.env`, lengkapnya di `.env.example`)

Wajib:

| Env | Keterangan |
|---|---|
| `DATABASE_URL` | Postgres 16+ |
| `ROBINHOOD_RPC` | RPC privat untuk transaksi |
| `TELEGRAM_BOT_TOKEN` | Sama dengan telegram. Backend kirim saja |
| `INTERNAL_TOKEN` | Shared secret dengan telegram, minimal 32 karakter (`openssl rand -hex 32`). Kosong berarti listener bot mati |
| `WALLET_MASTER_KEY` | Dibuat otomatis saat boot pertama kalau kosong. Harus sama dengan yang lama, kalau beda semua wallet di DB tidak bisa didekripsi |
| `WEB_PUBLIC_URL` | URL web yang dibuka user (`https://app.domain`). Dipakai untuk link `/web` dari bot. Kalau https, cookie jadi `__Host-` dan `X-Forwarded-For` dipercaya |

Disarankan atau sering diubah:

| Env | Default | Keterangan |
|---|---|---|
| `REDIS_URL` | kosong | Cache dan rate limit. Tanpa Redis tetap jalan, tapi lebih lambat |
| `WEB_ENABLE` | `true` | Harus nyala. Listener bot (8788) ikut start dari sini |
| `WEB_PORT`, `WEB_HOST` | `8787`, `127.0.0.1` | API untuk web |
| `INTERNAL_PORT`, `INTERNAL_HOST` | `8788`, `127.0.0.1` | Listener bot. Beda host: isi IP private, jangan `0.0.0.0` di host ber-IP publik |
| `ROBINHOOD_READ_RPC`, `ROBINHOOD_WS` | | RPC baca untuk tampilan, WebSocket untuk harga live |
| `ARC_RPC`, `ARC_*` | | Isi untuk mengaktifkan chain Arc |
| `ADMIN_IDS`, `TELEGRAM_ALLOWED_IDS` | | Admin dan whitelist beta |
| `FEE_WALLET`, `FEE_PRIVATE_KEY`, `FEE_USD`, `REFERRAL_SHARE`, `REF_MIN_CLAIM_USD` | | Fee dan referral |
| `KYBER_ENABLED`, `KYBER_CLIENT_ID`, `KYBER_API_KEY` | | Routing swap |
| `DATA_PLATFORM_RUNTIME`, `POOL_DIRECTORY_WORKER` | mati | Ingestion, candle, pool directory. Atau jalankan `npm run worker` terpisah |
| `CUSTOM_RPC_ENABLED` | | User boleh pasang RPC sendiri |
| `LOG_FILE`, `LOG_TZ_OFFSET` | | Log |

Sisanya (slippage, gas, deadline, dan lain-lain) adalah default per user yang bisa diubah lewat `/settings`.

`WEB_DIST_DIR` dan `WEB_PUBLIC_DIR` adalah sisa mode lama (backend serve static export). Kosongkan saja.

### web (`.env`)

| Env | Contoh | Keterangan |
|---|---|---|
| `BACKEND_ORIGIN` | `http://127.0.0.1:8787` | Port API backend, bukan 8788. Dibaca saat `next build` |
| `PORT` | `3000` | Port `next start` |

### telegram (`.env`)

| Env | Contoh | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | | Sama dengan backend |
| `BACKEND_URL` | `http://127.0.0.1:8788` | Listener internal backend, bukan port 8787 |
| `INTERNAL_TOKEN` | | Sama persis dengan backend |
| `TELEGRAM_BOT_USERNAME`, `LOG_FILE`, `LOG_TZ_OFFSET` | | Opsional |

Saat boot bot mengecek tiga env wajib, menunggu `botConfig` dari backend sampai 60 detik, lalu `getMe`, `setMyCommands`, dan mulai long poll.

### Yang harus sama di dua tempat

| Nilai | backend | web | telegram |
|---|---|---|---|
| Bot token | `TELEGRAM_BOT_TOKEN` | | `TELEGRAM_BOT_TOKEN` |
| Secret bot | `INTERNAL_TOKEN` | | `INTERNAL_TOKEN` |
| Alamat API (8787) | `WEB_HOST:WEB_PORT` | `BACKEND_ORIGIN` | |
| Alamat bot (8788) | `INTERNAL_HOST:INTERNAL_PORT` | | `BACKEND_URL` |
| URL publik web | `WEB_PUBLIC_URL` | domain di nginx | |

## Menjalankan lokal

```bash
# 1. backend
cd backend && npm install && cp .env.example .env   # isi env wajib
npm run migrate                                      # manual, tidak jalan saat boot
npm run bot

# 2. web
cd web && npm install && cp .env.example .env
npm run build && npm start                           # atau npm run dev (port 3100, hot reload)

# 3. telegram (token bot dev, jangan token production)
cd telegram && npm install && cp .env.example .env
npm start
```

Urutan start: Postgres dan Redis, lalu backend (sudah di-migrate), lalu web dan telegram (bebas urutannya). Login web lewat `/web` di bot.

## Deploy (satu host)

- Proses: backend, web, telegram. Masing-masing satu unit systemd.
- Hanya nginx/Caddy yang terbuka ke internet, dan dia hanya proxy ke web `:3000`. Port 8787 dan 8788 listen di 127.0.0.1.
- Update backend: `git pull`, `npm ci`, `npm run migrate`, restart. Migration tidak jalan otomatis.
- Update web: `git pull`, `npm ci`, `npm run build`, restart.

```nginx
server {
  server_name app.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;   # timpa, jangan append
    proxy_buffering off;                             # SSE /api/stream
    proxy_read_timeout 1h;
  }
}
```

Beda host: `INTERNAL_HOST` dan `WEB_HOST` backend diisi IP private (VPC atau WireGuard). Firewall hanya izinkan host web ke 8787 dan host bot ke 8788. Traffic-nya HTTP polos, jadi harus lewat jaringan private.

## Checklist pindah dari `enc-rh-lp-bot`

1. Copy `.env` production lama ke `backend/.env`. `WALLET_MASTER_KEY` jangan diganti.
2. Tambah `INTERNAL_TOKEN` (baru, minimal 32 karakter) di backend dan telegram.
3. `WEB_PUBLIC_URL` diisi URL web.
4. Backup DB, lalu `npm run migrate` di backend.
5. Matikan proses `enc-rh-lp-bot` lama sebelum telegram baru jalan, supaya `getUpdates` tidak bentrok.
6. Start backend, lalu web dan telegram.
7. Arahkan nginx ke web `:3000`.
