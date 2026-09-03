# Geseki

Koleksi widget overlay OBS untuk streaming, terhubung ke **Streamer.Bot** dan event **TikTok**
(lewat TikFinity / IndoFinity). Widget berupa HTML/CSS/JS polos yang dimuat sebagai browser
source di OBS — tanpa build step, tanpa framework.

> Project kedua setelah [nutty.gg](https://github.com/) — pola dan konvensi sama, dengan
> halaman settings bergaya ChatRD beraksen biru.

## Struktur

```
Geseki/
├── .utilities/
│   └── settings-page-builder/   # builder settings bersama (jangan dibuat ulang)
├── <widget>/                    # satu folder per widget
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── settings/
│       ├── index.html
│       ├── script.js
│       └── settings.json
└── resources/                   # aset bersama, level root (bukan per-widget)
    ├── icons/platforms/         # kick, kofi, patreon, tiktok, tipeeeStream, twitch, youtube
    ├── icons/badges/            # twitch-channel-point, youtube-*
    ├── sfx/notification.mp3
    └── logo/sekisungkarak_logo.png
```

## Widget

### `dynamic-island-alert`

Alert bergaya Dynamic Island iPhone untuk event TikTok (follow, subscribe, share, gift).

- Event TikTok via websocket **TikFinity** (`ws://localhost:21213/`) dan **IndoFinity**
  (`ws://localhost:62024/`) — reconnect tiap 5 detik, status terkoneksi jika salah satu hidup.
- Event Streamer.Bot via `@streamerbot/client` (host/port dari URL param).
- Antrean alert dengan flag lock, sehingga animasi tidak tumpang-tindih.
- 16 setting dalam 4 grup: Streamer.bot Connection, TikTok Connection, General, Alert Events.

## Cara pakai

1. Jalankan server lokal dari root project:

   ```bash
   python -m http.server 3000
   ```

2. Buka halaman settings widget:

   ```
   http://127.0.0.1:3000/dynamic-island-alert/settings/index.html
   ```

3. Atur setting, lalu klik **Copy URL**.
4. Tempel URL itu sebagai **Browser Source** baru di OBS.

## Catatan teknis

- **Konfigurasi lewat URL param** — bukan file config. Tiap param punya default, jadi widget
  tetap jalan walau dibuka tanpa param.
- **Settings tersimpan di localStorage** dengan kunci `<widget>-settings`, sehingga setting
  lama dari nutty.gg ikut terbawa.
- **Transparansi** — browser source OBS itu transparan. Saat dibuka langsung di browser,
  widget mendeteksi tidak adanya `window.obsstudio` lalu memasang latar checkerboard gelap
  agar tidak silau; di OBS tetap transparan asli.
- **Aksen warna** — `--accent-color: #2196f3` (biru), warisan gaya ChatRD.

## Version control

Project ini pakai Git. Commit pertama dibuat 2026-09-04, jadi perubahan bisa di-rollback:

```bash
git log --oneline
git status
```
