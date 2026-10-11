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
└── js/app.js
```

## Data

Data tersimpan di `localStorage` browser (key `jurnal_trading_v1`). Lakukan export JSON berkala dari halaman Pengaturan sebagai cadangan.
