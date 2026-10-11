# Jurnal Trading

Aplikasi web statis untuk mencatat dan mengevaluasi transaksi trading. Tema gelap, tanpa dependensi build, data tersimpan di `localStorage` browser.

## Fitur

- Dashboard: total P/L, win rate, profit factor, R multiple, drawdown, equity curve
- Log Transaksi: form entry/exit, lot, risiko, R multiple otomatis, tag, mood, disiplin, screenshot chart
- Kalender: heatmap P/L harian
- Analitik: performa per simbol, setup, arah, hari, jam, mood, kualitas eksekusi, pelanggaran aturan
- Playbook: daftar setup + checklist pre-trade
- Risk & Plan: aturan risiko, trading plan, checklist sesi
- Pengaturan: modal awal, mata uang, export/import JSON dan CSV

## Cara menjalankan

Tidak perlu build tool. Buka langsung di browser:

1. Buka file `index.html`, atau
2. Jalankan server lokal dari folder ini:

```powershell
python -m http.server 8080
```

Lalu buka `http://localhost:8080`.

## Struktur

```
jurnal-trading/
├── index.html
├── css/style.css
├── js/storage.js
├── js/stats.js
├── js/charts.js
├── js/config.js    <- isi URL + anon key Supabase di sini
├── js/cloud.js     <- auth email + sinkronisasi cloud
├── js/app.js
└── supabase/schema.sql
```

## Data

Tanpa konfigurasi: data tersimpan di `localStorage` browser (key `jurnal_trading_v1`).
Lakukan export JSON berkala dari halaman Pengaturan sebagai cadangan.

## Login email + sinkronisasi cloud (Supabase)

1. Buat project gratis di supabase.com.
2. Buka **SQL Editor** di dashboard, paste seluruh isi `supabase/schema.sql`, klik **Run**.
3. Buka **Project Settings → API**, copy **Project URL** dan **anon public key**,
   isi ke `js/config.js`. Jangan pernah memakai `service_role key` di frontend.
4. Opsional tapi disarankan: **Authentication → Providers → Email → matikan
   "Confirm email"** agar daftar akun langsung bisa masuk tanpa verifikasi.
5. Commit + deploy ulang. Buka aplikasi → daftar dengan email → masuk.
   Data lama di `localStorage` tetap ada di browser; setelah masuk,
   perubahan berikutnya tersinkron otomatis ke cloud. Tombol
   **Sinkron Sekarang** di Pengaturan mengunggah seluruh data lokal saat itu juga.
