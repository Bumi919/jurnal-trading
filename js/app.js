/* =========================================================
   app.js - Router, render halaman, dan interaksi
   ========================================================= */

var state = Storage.load();
var currentRoute = 'dashboard';

var tradeFilters = { q: '', status: '', side: '', setup: '', from: '', to: '' };
var analyticsFilters = { from: '', to: '', symbol: '', side: '', setup: '', result: '', tag: '' };
var calCursor = { y: new Date().getFullYear(), m: new Date().getMonth() };

var pendingShot = '';

/* ---------- Util DOM ---------- */

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(sel));
}

function save() {
  var ok = Storage.save(state);
  if (!ok) toast('Gagal menyimpan. Penyimpanan browser mungkin penuh.', 'err');
  return ok;
}

function toast(msg, type) {
  var root = $('#toast-root');
  var el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3200);
}

function openModal(html) {
  $('#modal-root').innerHTML = '<div class="modal-overlay" data-overlay>' + html + '</div>';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
  pendingShot = '';
}

document.addEventListener('click', function (e) {
  if (e.target.hasAttribute && e.target.hasAttribute('data-overlay')) closeModal();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

function confirmDialog(title, message, onOk, okLabel) {
  openModal(
    '<div class="modal modal-sm">' +
      '<div class="modal-head"><h2>' + esc(title) + '</h2></div>' +
      '<div class="modal-body"><p style="margin:0">' + esc(message) + '</p></div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-close>Batal</button>' +
        '<button class="btn btn-danger" id="confirmOk">' + esc(okLabel || 'Hapus') + '</button>' +
      '</div>' +
    '</div>'
  );
  $('[data-close]').addEventListener('click', closeModal);
  $('#confirmOk').addEventListener('click', function () {
    closeModal();
    onOk();
  });
}

function bindClose() {
  var btn = $('[data-close]');
  if (btn) btn.addEventListener('click', closeModal);
}

/* ---------- Util data ---------- */

function setupName(id) {
  if (!id) return '';
  var s = SetupStore.get(state, id);
  return s ? s.name : '';
}

function setupOptions(selected) {
  var html = '<option value="">Tanpa setup</option>';
  state.setups.forEach(function (s) {
    html += '<option value="' + esc(s.id) + '"' +
      (s.id === selected ? ' selected' : '') + '>' + esc(s.name) + '</option>';
  });
  return html;
}

function selectHtml(id, options, selected, placeholder) {
  var html = '<select id="' + id + '">';
  if (placeholder !== null) {
    html += '<option value="">' + esc(placeholder || 'Semua') + '</option>';
  }
  options.forEach(function (o) {
    var val = typeof o === 'object' ? o.value : o;
    var lbl = typeof o === 'object' ? o.label : o;
    html += '<option value="' + esc(val) + '"' +
      (String(val) === String(selected || '') ? ' selected' : '') + '>' + esc(lbl) + '</option>';
  });
  return html + '</select>';
}

function filteredTrades(trades, f) {
  return trades.filter(function (t) {
    if (f.q) {
      var q = f.q.toLowerCase();
      var hay = (t.symbol + ' ' + t.notes + ' ' + t.tags.join(' ') + ' ' +
        setupName(t.setupId)).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    if (f.status && t.status !== f.status) return false;
    if (f.result && t.result !== f.result) return false;
    if (f.side && t.side !== f.side) return false;
    if (f.setup && t.setupId !== f.setup) return false;
    if (f.symbol && t.symbol !== f.symbol) return false;
    if (f.tag && t.tags.indexOf(f.tag) === -1) return false;
    if (f.from && (t.entryDate || '').slice(0, 10) < f.from) return false;
    if (f.to && (t.entryDate || '').slice(0, 10) > f.to) return false;
    return true;
  });
}

function resultBadge(t) {
  var map = {
    win: ['win', 'Win'],
    loss: ['loss', 'Loss'],
    open: ['open', 'Open'],
    be: ['be', 'Breakeven']
  };
  var m = map[t.result] || ['be', '-'];
  return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
}

function sideBadge(t) {
  return t.side === 'long'
    ? '<span class="badge long">Long</span>'
    : '<span class="badge short">Short</span>';
}

function tagsHtml(tags) {
  if (!tags || !tags.length) return '<span class="muted small">-</span>';
  return tags.map(function (tag) {
    return '<span class="badge tag" style="margin-right:4px">' + esc(tag) + '</span>';
  }).join('');
}

function statCard(label, value, sub, cls) {
  return '<div class="stat">' +
    '<div class="label">' + esc(label) + '</div>' +
    '<div class="value ' + (cls || '') + '">' + value + '</div>' +
    (sub ? '<div class="sub">' + sub + '</div>' : '') +
    '</div>';
}

/* =========================================================
   ROUTER
   ========================================================= */

var ROUTES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  trades: { title: 'Log Transaksi', render: renderTrades },
  calendar: { title: 'Kalender', render: renderCalendar },
  analytics: { title: 'Analitik', render: renderAnalytics },
  playbook: { title: 'Playbook', render: renderPlaybook },
  risk: { title: 'Risk & Plan', render: renderRisk },
  settings: { title: 'Pengaturan', render: renderSettings }
};

function route() {
  var hash = (location.hash || '').replace('#/', '').split('?')[0];
  if (!ROUTES[hash]) hash = 'dashboard';
  currentRoute = hash;

  $$('#nav a').forEach(function (a) {
    a.classList.toggle('active', a.getAttribute('data-route') === hash);
  });

  $('#pageTitle').textContent = ROUTES[hash].title;
  $('#view').innerHTML = '';
  ROUTES[hash].render();
  renderSidebarSummary();
  window.scrollTo(0, 0);

  if (window.innerWidth <= 860) $('#sidebar').classList.remove('open');
}

function refresh() {
  save();
  renderSidebarSummary();
  ROUTES[currentRoute].render();
}

function renderSidebarSummary() {
  var rows = Stats.sidebar(state);
  $('#sidebarSummary').innerHTML = rows.map(function (r) {
    return '<div class="row"><span>' + esc(r.label) + '</span>' +
      '<b class="' + (r.cls || '') + '">' + esc(r.value) + '</b></div>';
  }).join('');
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {
  var s = Stats.summary(state);
  var cur = state.settings.currency;
  var html = '';

  // Peringatan aturan
  var today = Stats.todayRisk(state);
  if (today.hitDailyLoss) {
    html += '<div class="alert danger"><strong>Batas rugi harian tercapai</strong>' +
      'P/L hari ini ' + fmtSigned(cur, today.pnl) + ' sudah menyentuh batas ' +
      fmtMoney(cur, today.dailyLimit) + '. Sebaiknya hentikan trading hari ini.' +
      '</div>';
  } else if (today.hitRisk) {
    html += '<div class="alert warn"><strong>Total risiko hari ini melebihi batas</strong>' +
      'Risiko terpakai ' + fmtMoney(cur, today.riskUsed) + ' dari batas ' +
      fmtMoney(cur, today.riskLimit) + ' per hari.' +
      '</div>';
  }

  if (s.currentStreak.type === 'loss' && s.currentStreak.count >= state.settings.maxLossStreak) {
    html += '<div class="alert danger"><strong>Rugi beruntun</strong>' +
      'Anda mengalami ' + s.currentStreak.count + ' rugi beruntun. ' +
      'Batasi diri sesuai aturan risk management.' +
      '</div>';
  }

  if (!state.trades.length) {
    html += '<div class="empty">' +
      '<div class="title">Belum ada data transaksi</div>' +
      '<div class="desc">Mulai dengan mencatat trade pertama Anda, atau atur modal dan ' +
      'aturan risiko di halaman Pengaturan.</div>' +
      '<button class="btn btn-primary" id="emptyAdd">Tambah Trade Pertama</button>' +
      '</div>';
    $('#view').innerHTML = html;
    $('#emptyAdd').addEventListener('click', function () { openTradeModal(); });
    return;
  }

  // Kartu statistik
  html += '<div class="grid g-6 section">' +
    statCard('Total P/L', esc(fmtSigned(cur, s.totalPnl)),
      'ROI ' + s.roi.toFixed(1) + '% dari modal', signClass(s.totalPnl)) +
    statCard('Win Rate', s.winRate.toFixed(1) + '%',
      s.wins + ' menang / ' + s.losses + ' kalah') +
    statCard('Profit Factor',
      isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : 'n/a',
      'Gross win ' + fmtMoney(cur, s.grossWin)) +
    statCard('Rata-rata R', (s.avgR >= 0 ? '+' : '') + s.avgR.toFixed(2) + 'R',
      'Expectancy ' + fmtSigned(cur, s.expectancy) + '/trade', signClass(s.avgR)) +
    statCard('Max Drawdown', esc(fmtMoney(cur, s.maxDrawdown)),
      s.maxDrawdownPct.toFixed(1) + '% dari puncak', 'neg') +
    statCard('Total Trade', String(s.closedCount),
      s.openCount + ' posisi terbuka') +
    '</div>';

  // Equity curve + donut
  var eqLabels = s.equity.map(function (p, i) {
    return i === 0 ? 'Awal' : shortDate(p.date);
  });
  var eqValues = s.equity.map(function (p) { return p.value; });

  html += '<div class="grid g-32 section">' +
    '<div class="card">' +
      '<div class="card-head"><h2>Equity Curve</h2>' +
      '<span class="small muted">Modal akhir ' +
      esc(fmtMoney(cur, s.capitalNow)) + '</span></div>' +
      Charts.line({
        values: eqValues,
        labels: eqLabels,
        height: 240,
        format: function (v) { return cur + Math.round(v).toLocaleString('id-ID'); }
      }) +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><h2>Komposisi Hasil</h2></div>' +
      Charts.donut({
        parts: [
          { label: 'Win', value: s.wins, color: '#22c55e' },
          { label: 'Loss', value: s.losses, color: '#ef4444' },
          { label: 'Breakeven', value: s.breakevens, color: '#6b7a89' }
        ]
      }) +
      '<div style="margin-top:16px" class="kv">' +
        '<dt>Rentetan sekarang</dt><dd>' +
          (s.currentStreak.type === 'none' ? 'Tidak ada' :
            s.currentStreak.count + ' ' + s.currentStreak.type) + '</dd>' +
        '<dt>Rentetan menang terpanjang</dt><dd>' + s.bestWinStreak + '</dd>' +
        '<dt>Rentetan kalah terpanjang</dt><dd>' + s.worstLossStreak + '</dd>' +
        '<dt>Rata-rata per trade</dt><dd class="' + signClass(s.avgPerTrade) + '">' +
          esc(fmtSigned(cur, s.avgPerTrade)) + '</dd>' +
      '</div>' +
    '</div>' +
    '</div>';

  // Perbandingan bulan + PnL bulanan
  var cmp = Stats.monthCompare(state.trades);
  var monthly = Stats.byMonth(Stats.closed(state.trades));

  html += '<div class="grid g-2 section">' +
    '<div class="card">' +
      '<div class="card-head"><h2>PnL Bulanan</h2></div>' +
      (monthly.length
        ? Charts.bars({
            labels: monthly.map(function (m) { return monthLabel(m.key); }),
            values: monthly.map(function (m) { return m.pnl; }),
            format: function (v) {
              return (v > 0 ? '+' : '') + Math.round(v).toLocaleString('id-ID');
            },
            colorFn: function (v) { return v >= 0 ? '#22c55e' : '#ef4444'; }
          })
        : Charts.empty('Belum ada trade tertutup')) +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><h2>Perbandingan Bulan</h2></div>' +
      '<div class="kv">' +
        '<dt>' + esc(monthLabel(cmp.thisKey)) + '</dt>' +
        '<dd class="' + signClass(cmp.thisPnl) + '"><b>' +
          esc(fmtSigned(cur, cmp.thisPnl)) + '</b> dari ' +
          cmp.thisCount + ' trade</dd>' +
        '<dt>' + esc(monthLabel(cmp.prevKey)) + '</dt>' +
        '<dd class="' + signClass(cmp.prevPnl) + '"><b>' +
          esc(fmtSigned(cur, cmp.prevPnl)) + '</b> dari ' +
          cmp.prevCount + ' trade</dd>' +
        '<dt>Perubahan</dt><dd class="' +
          signClass(cmp.thisPnl - cmp.prevPnl) + '"><b>' +
          esc(fmtSigned(cur, cmp.thisPnl - cmp.prevPnl)) + '</b></dd>' +
      '</div>' +
      '<div style="margin-top:14px">' +
        '<h3>Target risiko hari ini</h3>' +
        '<div class="meter-row">' +
          '<div class="lbl"><span>Risiko terpakai</span>' +
          '<span class="mono">' + esc(fmtMoney(cur, today.riskUsed)) +
          ' / ' + esc(fmtMoney(cur, today.riskLimit)) + '</span></div>' +
          '<div class="bar-track"><div class="bar-fill ' +
            (today.hitRisk ? 'red' : '') + '" style="width:' +
            (today.riskLimit > 0
              ? Math.min(100, (today.riskUsed / today.riskLimit) * 100).toFixed(0)
              : 0) + '%"></div></div>' +
        '</div>' +
        '<div class="meter-row">' +
          '<div class="lbl"><span>P/L hari ini</span>' +
          '<span class="mono ' + signClass(today.pnl) + '">' +
          esc(fmtSigned(cur, today.pnl)) + ' / ' +
          esc('-' + fmtMoney(cur, today.dailyLimit)) + '</span></div>' +
          '<div class="bar-track"><div class="bar-fill ' +
            (today.pnl < 0 ? 'red' : 'green') + '" style="width:' +
            (today.dailyLimit > 0
              ? Math.min(100, (Math.abs(today.pnl) / today.dailyLimit) * 100).toFixed(0)
              : 0) + '%"></div></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '</div>';

  // Trade terakhir
  var recent = state.trades.slice().sort(function (a, b) {
    return (b.entryDate || '').localeCompare(a.entryDate || '');
  }).slice(0, 6);

  html += '<div class="card">' +
    '<div class="card-head"><h2>Trade Terakhir</h2>' +
    '<a href="#/trades" class="btn btn-ghost btn-sm">Lihat Semua</a></div>' +
    tradeTable(recent, { compact: true }) +
    '</div>';

  $('#view').innerHTML = html;
}

/* =========================================================
   LOG TRANSAKSI
   ========================================================= */

function tradeTable(trades, opts) {
  opts = opts || {};
  if (!trades.length) {
    return '<div class="empty"><div class="title">Tidak ada trade</div>' +
      '<div class="desc">' +
      (opts.emptyMsg || 'Belum ada transaksi yang cocok dengan filter ini.') +
      '</div></div>';
  }

  var rows = trades.map(function (t) {
    return '<tr data-id="' + esc(t.id) + '">' +
      '<td>' + esc(shortDateTime(t.entryDate)) + '</td>' +
      '<td><b>' + esc(t.symbol) + '</b></td>' +
      '<td>' + sideBadge(t) + '</td>' +
      '<td>' + resultBadge(t) + '</td>' +
      (opts.compact ? '' :
        '<td class="num">' + esc(String(t.entryPrice || '-')) + '</td>' +
        '<td class="num">' + esc(String(t.exitPrice || '-')) + '</td>' +
        '<td class="num">' + esc(t.lot ? String(t.lot) : '-') + '</td>') +
      '<td class="num muted">' + esc(fmtMoney(state.settings.currency, t.risk)) + '</td>' +
      '<td class="num ' + signClass(t.pnl) + '">' +
        (t.status === 'open' ? '-' : esc(fmtSigned(state.settings.currency, t.pnl))) + '</td>' +
      '<td class="num ' + signClass(t.rMultiple) + '">' +
        (t.status === 'open' ? '-' : (t.rMultiple >= 0 ? '+' : '') + t.rMultiple.toFixed(2) + 'R') + '</td>' +
      '<td>' + esc(setupName(t.setupId) || '-') + '</td>' +
      (opts.compact ? '' : '<td>' + tagsHtml(t.tags) + '</td>') +
      '<td class="num">' +
        '<button class="btn-icon" data-act="edit" data-id="' + esc(t.id) + '">Edit</button> ' +
        '<button class="btn-icon" data-act="del" data-id="' + esc(t.id) + '">Hapus</button>' +
      '</td>' +
      '</tr>';
  }).join('');

  return '<div class="table-wrap"><table>' +
    '<thead><tr>' +
      '<th>Tanggal</th><th>Simbol</th><th>Arah</th><th>Hasil</th>' +
      (opts.compact ? '' : '<th class="num">Entry</th><th class="num">Exit</th><th class="num">Lot</th>') +
      '<th class="num">Risiko</th><th class="num">PnL</th><th class="num">R</th>' +
      '<th>Setup</th>' + (opts.compact ? '' : '<th>Tag</th>') +
      '<th class="num">Aksi</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderTrades() {
  var list = filteredTrades(state.trades, tradeFilters);
  list = list.slice().sort(function (a, b) {
    return (b.entryDate || '').localeCompare(a.entryDate || '');
  });

  var closed = Stats.closed(list);
  var totalPnl = closed.reduce(function (a, t) { return a + t.pnl; }, 0);
  var totalRisk = list.reduce(function (a, t) { return a + t.risk; }, 0);
  var wins = closed.filter(function (t) { return t.result === 'win'; }).length;
  var wr = closed.length ? (wins / closed.length) * 100 : 0;

  var html = '';

  html += '<div class="card section">' +
    '<div class="filters">' +
      '<div class="field w-md"><label>Cari</label>' +
        '<input type="search" id="fQ" placeholder="Simbol, catatan, tag..." value="' +
        esc(tradeFilters.q) + '"></div>' +
      '<div class="field w-sm"><label>Status</label>' +
        selectHtml('fStatus', [
          { value: 'closed', label: 'Selesai' },
          { value: 'open', label: 'Terbuka' }
        ], tradeFilters.status) + '</div>' +
      '<div class="field w-sm"><label>Arah</label>' +
        selectHtml('fSide', [
          { value: 'long', label: 'Long' },
          { value: 'short', label: 'Short' }
        ], tradeFilters.side) + '</div>' +
      '<div class="field w-md"><label>Setup</label>' +
        selectHtml('fSetup', state.setups.map(function (s) {
          return { value: s.id, label: s.name };
        }), tradeFilters.setup) + '</div>' +
      '<div class="field w-sm"><label>Dari</label>' +
        '<input type="date" id="fFrom" value="' + esc(tradeFilters.from) + '"></div>' +
      '<div class="field w-sm"><label>Sampai</label>' +
        '<input type="date" id="fTo" value="' + esc(tradeFilters.to) + '"></div>' +
      '<button class="btn btn-ghost" id="fReset" type="button">Reset</button>' +
    '</div>' +

    '<div class="grid g-4">' +
      statCard('Trade', String(list.length),
        Stats.open(list).length + ' masih terbuka') +
      statCard('PnL', esc(fmtSigned(state.settings.currency, totalPnl)),
        'Total risiko ' + esc(fmtMoney(state.settings.currency, totalRisk)),
        signClass(totalPnl)) +
      statCard('Win rate', wr.toFixed(1) + '%',
        wins + ' menang dari ' + closed.length + ' selesai') +
      statCard('Rata-rata R',
        closed.length
          ? ((closed.reduce(function (a, t) { return a + t.rMultiple; }, 0) / closed.length).toFixed(2)) + 'R'
          : '0.00R',
        '', '') +
    '</div>' +
    '</div>';

  html += tradeTable(list, { emptyMsg: 'Tidak ada trade yang cocok. Ubah filter atau tambah trade baru.' });

  if (list.length) {
    html += '<div class="table-foot">' +
      '<span>Menampilkan ' + list.length + ' dari ' + state.trades.length + ' trade</span>' +
      '<span>Total PnL: <b class="' + signClass(totalPnl) + '">' +
      esc(fmtSigned(state.settings.currency, totalPnl)) + '</b></span>' +
      '</div>';
  }

  $('#view').innerHTML = html;

  // events
  var rerender = function () {
    tradeFilters.q = $('#fQ').value;
    tradeFilters.status = $('#fStatus').value;
    tradeFilters.side = $('#fSide').value;
    tradeFilters.setup = $('#fSetup').value;
    tradeFilters.from = $('#fFrom').value;
    tradeFilters.to = $('#fTo').value;
    renderTrades();
  };

  $('#fQ').addEventListener('input', debounce(rerender, 220));
  ['#fStatus', '#fSide', '#fSetup', '#fFrom', '#fTo'].forEach(function (sel) {
    $(sel).addEventListener('change', rerender);
  });
  $('#fReset').addEventListener('click', function () {
    tradeFilters = { q: '', status: '', side: '', setup: '', from: '', to: '' };
    renderTrades();
  });

  bindTradeTableActions($('#view'));
}

function bindTradeTableActions(root) {
  root.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var act = btn.getAttribute('data-act');

    if (act === 'edit') openTradeModal(id);
    if (act === 'del') {
      var t = TradeStore.get(state, id);
      confirmDialog('Hapus trade',
        'Hapus trade ' + (t ? t.symbol + ' pada ' + shortDate(t.entryDate) : 'ini') +
        '? Tindakan ini tidak bisa dibatalkan.',
        function () {
          TradeStore.remove(state, id);
          refresh();
          toast('Trade dihapus');
        });
    }
  });
}

function debounce(fn, wait) {
  var timer = null;
  return function () {
    clearTimeout(timer);
    timer = setTimeout(fn, wait);
  };
}

/* =========================================================
   FORM TRADE (MODAL)
   ========================================================= */

function localDateTimeValue(d) {
  d = d || new Date();
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function openTradeModal(id) {
  var t = id ? TradeStore.get(state, id) : null;
  if (id && !t) return;
  pendingShot = t && t.screenshot ? t.screenshot : '';

  var v = t || {
    symbol: '', market: 'Forex', side: 'long', status: 'closed',
    entryDate: localDateTimeValue(), exitDate: localDateTimeValue(),
    entryPrice: '', exitPrice: '', sl: '', tp: '', lot: '', pips: '',
    risk: '', pnl: '', setupId: '', tags: [], quality: 0, mood: '',
    disciplined: false, notes: '', screenshot: ''
  };

  var tagsStr = (v.tags || []).join(', ');

  var html =
  '<div class="modal">' +
    '<div class="modal-head">' +
      '<h2>' + (t ? 'Edit Trade' : 'Tambah Trade') + '</h2>' +
      '<button class="btn-icon" data-close type="button">Tutup</button>' +
    '</div>' +
    '<div class="modal-body">' +
      '<form id="tradeForm">' +

        '<fieldset><legend>Identitas Transaksi</legend>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>Simbol / Pair *</label>' +
              '<input type="text" id="tSymbol" required placeholder="EURUSD, BTCUSD..." value="' +
              esc(v.symbol) + '"></div>' +
            '<div class="field"><label>Pasar</label>' +
              selectHtml('tMarket', MARKETS, v.market, null) + '</div>' +
            '<div class="field"><label>Arah</label>' +
              selectHtml('tSide', [
                { value: 'long', label: 'Long / Buy' },
                { value: 'short', label: 'Short / Sell' }
              ], v.side, null) + '</div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>Waktu entry</label>' +
              '<input type="datetime-local" id="tEntryDate" value="' + esc(v.entryDate) + '"></div>' +
            '<div class="field"><label>Waktu exit</label>' +
              '<input type="datetime-local" id="tExitDate" value="' + esc(v.exitDate) + '"></div>' +
            '<div class="field"><label>Status posisi</label>' +
              selectHtml('tStatus', [
                { value: 'closed', label: 'Selesai (closed)' },
                { value: 'open', label: 'Masih terbuka' }
              ], v.status, null) + '</div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset><legend>Harga dan Ukuran Posisi</legend>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>Harga entry</label>' +
              '<input type="number" step="any" id="tEntryPrice" value="' + esc(v.entryPrice) + '"></div>' +
            '<div class="field"><label>Harga exit</label>' +
              '<input type="number" step="any" id="tExitPrice" value="' + esc(v.exitPrice) + '"></div>' +
            '<div class="field"><label>Lot / Ukuran</label>' +
              '<input type="number" step="any" id="tLot" value="' + esc(v.lot) + '"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>Stop Loss</label>' +
              '<input type="number" step="any" id="tSL" value="' + esc(v.sl) + '"></div>' +
            '<div class="field"><label>Take Profit</label>' +
              '<input type="number" step="any" id="tTP" value="' + esc(v.tp) + '"></div>' +
            '<div class="field"><label>Pips / Poin</label>' +
              '<input type="number" step="any" id="tPips" value="' + esc(v.pips) + '"></div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset><legend>Risiko dan Hasil</legend>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>Risiko (' + esc(state.settings.currency) + ')</label>' +
              '<input type="number" step="any" id="tRisk" value="' + esc(v.risk) + '"></div>' +
            '<div class="field"><label>PnL / Hasil (' + esc(state.settings.currency) + ')</label>' +
              '<input type="number" step="any" id="tPnl" value="' + esc(v.pnl) + '"></div>' +
            '<div class="field"><label>R Multiple</label>' +
              '<input type="number" step="0.01" id="tR" placeholder="otomatis dari risiko">' +
              '<div class="hint" id="rPreview"></div></div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset><legend>Setup dan Kualitas</legend>' +
          '<div class="form-row">' +
            '<div class="field"><label>Setup / Strategy</label>' +
              '<select id="tSetup">' + setupOptions(v.setupId) + '</select></div>' +
            '<div class="field"><label>Tag (pisahkan dengan koma)</label>' +
              '<input type="text" id="tTags" placeholder="breakout, pullback, fomo" value="' +
              esc(tagsStr) + '"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>Kualitas eksekusi</label>' +
              selectHtml('tQuality', ['1', '2', '3', '4', '5'], v.quality ? String(v.quality) : '', 'Belum dinilai') + '</div>' +
            '<div class="field"><label>Mood</label>' +
              selectHtml('tMood', MOODS, v.mood) + '</div>' +
            '<div class="field"><label>Disiplin pada rencana</label>' +
              selectHtml('tDisciplined', [
                { value: 'ya', label: 'Ya, disiplin' },
                { value: 'tidak', label: 'Tidak, melanggar' }
              ], v.disciplined ? 'ya' : '') + '</div>' +
          '</div>' +
          '<div id="setupChecklist"></div>' +
        '</fieldset>' +

        '<fieldset><legend>Catatan dan Screenshot</legend>' +
          '<div class="field"><label>Catatan / Pelajaran</label>' +
            '<textarea id="tNotes" placeholder="Apa yang terjadi, apa yang dipelajari...">' +
            esc(v.notes) + '</textarea></div>' +
          '<div class="field"><label>Screenshot chart</label>' +
            '<input type="file" id="tShot" accept="image/*">' +
            '<div id="shotPreview"></div>' +
          '</div>' +
        '</fieldset>' +

      '</form>' +
    '</div>' +
    '<div class="modal-foot">' +
      (t ? '<button class="btn btn-danger left" id="delTrade" type="button">Hapus Trade</button>' : '') +
      '<button class="btn btn-ghost" data-close type="button">Batal</button>' +
      '<button class="btn btn-primary" id="saveTrade" type="button">Simpan Trade</button>' +
    '</div>' +
  '</div>';

  openModal(html);
  bindClose();

  var form = $('#tradeForm');

  // Interaksi R Multiple
  var updateRPreview = function () {
    var risk = Number($('#tRisk').value) || 0;
    var pnl = Number($('#tPnl').value) || 0;
    var r = risk !== 0 ? pnl / risk : 0;
    $('#rPreview').textContent = risk !== 0
      ? 'Hasil: ' + (r >= 0 ? '+' : '') + r.toFixed(2) + 'R'
      : 'Isi risiko untuk menghitung R';
    return r;
  };
  $('#tRisk').addEventListener('input', updateRPreview);
  $('#tPnl').addEventListener('input', updateRPreview);
  $('#tR').addEventListener('input', function () {
    var risk = Number($('#tRisk').value) || 0;
    var r = Number(this.value);
    if (risk !== 0 && isFinite(r)) {
      $('#tPnl').value = (risk * r).toFixed(2);
    }
    updateRPreview();
  });
  updateRPreview();

  // Status open menonaktifkan kolom hasil
  var syncStatus = function () {
    var open = $('#tStatus').value === 'open';
    $('#tPnl').disabled = open;
    $('#tExitDate').disabled = open;
    $('#tExitPrice').disabled = open;
  };
  $('#tStatus').addEventListener('change', syncStatus);
  syncStatus();

  // Checklist setup terpilih
  var renderChecklist = function () {
    var box = $('#setupChecklist');
    var setup = SetupStore.get(state, $('#tSetup').value);
    if (!setup || !setup.checklist || !setup.checklist.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = '<div class="field"><label>Checklist pre-trade: ' +
      esc(setup.name) + '</label><div class="check-list">' +
      setup.checklist.map(function (c, i) {
        return '<div class="check-item">' +
          '<input type="checkbox" id="sc_' + i + '">' +
          '<label for="sc_' + i + '">' + esc(c) + '</label></div>';
      }).join('') + '</div>' +
      '<div class="hint">Centang bila syarat ini terpenuhi sebelum entry.</div></div>';
  };
  $('#tSetup').addEventListener('change', renderChecklist);
  renderChecklist();

  // Screenshot
  var renderShot = function () {
    var box = $('#shotPreview');
    if (!pendingShot) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="shot-preview">' +
      '<img src="' + pendingShot + '" alt="Screenshot chart">' +
      '<button type="button" class="rm" id="rmShot">Hapus</button></div>';
    $('#rmShot').addEventListener('click', function () {
      pendingShot = '';
      $('#tShot').value = '';
      renderShot();
    });
  };
  $('#tShot').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    compressImage(file, function (dataUrl) {
      pendingShot = dataUrl;
      renderShot();
    });
  });
  renderShot();

  // Aksi
  $('#saveTrade').addEventListener('click', function () {
    var symbol = $('#tSymbol').value.trim();
    if (!symbol) {
      toast('Simbol wajib diisi', 'err');
      $('#tSymbol').focus();
      return;
    }

    var isOpen = $('#tStatus').value === 'open';
    var data = {
      symbol: symbol,
      market: $('#tMarket').value,
      side: $('#tSide').value,
      status: isOpen ? 'open' : 'closed',
      entryDate: $('#tEntryDate').value,
      exitDate: isOpen ? '' : $('#tExitDate').value,
      entryPrice: $('#tEntryPrice').value,
      exitPrice: isOpen ? '' : $('#tExitPrice').value,
      sl: $('#tSL').value,
      tp: $('#tTP').value,
      lot: $('#tLot').value,
      pips: $('#tPips').value,
      risk: $('#tRisk').value,
      pnl: isOpen ? 0 : $('#tPnl').value,
      setupId: $('#tSetup').value,
      tags: $('#tTags').value.split(',').map(function (s) { return s.trim(); })
        .filter(Boolean),
      quality: $('#tQuality').value,
      mood: $('#tMood').value,
      disciplined: $('#tDisciplined').value === 'ya',
      notes: $('#tNotes').value.trim(),
      screenshot: pendingShot
    };

    if (t) TradeStore.update(state, t.id, data);
    else TradeStore.add(state, data);

    closeModal();
    refresh();
    toast(t ? 'Trade diperbarui' : 'Trade tersimpan', 'ok');
  });

  if (t) {
    $('#delTrade').addEventListener('click', function () {
      confirmDialog('Hapus trade', 'Hapus trade ' + t.symbol + ' ini?',
        function () {
          TradeStore.remove(state, t.id);
          closeModal();
          refresh();
          toast('Trade dihapus');
        });
    });
  }
}

function compressImage(file, cb) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var maxW = 1280;
      var scale = Math.min(1, maxW / img.width);
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var out = canvas.toDataURL('image/jpeg', 0.72);
      if (out.length > 900000) {
        toast('Ukuran gambar masih besar, kualitas dikurangi', 'err');
        out = canvas.toDataURL('image/jpeg', 0.45);
      }
      cb(out);
    };
    img.onerror = function () { toast('Gambar tidak bisa dibaca', 'err'); };
    img.src = e.target.result;
  };
  reader.onerror = function () { toast('Gambar tidak bisa dibaca', 'err'); };
  reader.readAsDataURL(file);
}

/* =========================================================
   KALENDER
   ========================================================= */

function renderCalendar() {
  var y = calCursor.y, m = calCursor.m;
  var monthKey = y + '-' + String(m + 1).padStart(2, '0');
  var daily = Stats.dailyMap(state.trades);

  var first = new Date(y, m, 1);
  var startDow = (first.getDay() + 6) % 7; // Senin = 0
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var todayStr = new Date().toISOString().slice(0, 10);

  var monthTrades = 0, monthPnl = 0;
  Object.keys(daily).forEach(function (key) {
    if (key.slice(0, 7) === monthKey) {
      monthTrades += daily[key].count;
      monthPnl += daily[key].pnl;
    }
  });

  var dowNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  var html = '<div class="card">' +
    '<div class="cal-head">' +
      '<button class="btn btn-ghost btn-sm" id="calPrev" type="button">Bulan Sebelumnya</button>' +
      '<div class="cal-title">' + monthLabel(monthKey) +
        ' <span class="muted small">- ' + monthTrades + ' trade, ' +
        '<b class="' + signClass(monthPnl) + '">' +
        esc(fmtSigned(state.settings.currency, monthPnl)) + '</b></span></div>' +
      '<button class="btn btn-ghost btn-sm" id="calNext" type="button">Bulan Berikutnya</button>' +
    '</div>' +
    '<div class="cal-grid">';

  dowNames.forEach(function (d) {
    html += '<div class="cal-dow">' + d + '</div>';
  });

  for (var i = 0; i < startDow; i++) {
    html += '<div class="cal-cell empty-cell"></div>';
  }

  for (var day = 1; day <= daysInMonth; day++) {
    var key = y + '-' + String(m + 1).padStart(2, '0') + '-' +
      String(day).padStart(2, '0');
    var info = daily[key];
    var cls = 'cal-cell';
    if (info && info.pnl > 0) cls += ' day-win';
    else if (info && info.pnl < 0) cls += ' day-loss';
    else if (info) cls += ' day-flat';
    if (key === todayStr) cls += ' today';

    html += '<div class="' + cls + '" data-day="' + key + '">' +
      '<div class="d">' + day + '</div>' +
      (info
        ? '<div class="pnl ' + signClass(info.pnl) + '">' +
          esc(fmtSigned(state.settings.currency, info.pnl)) + '</div>' +
          '<div class="cnt">' + info.count + ' trade</div>'
        : '<div class="cnt"></div>') +
      '</div>';
  }

  html += '</div>' +
    '<div class="cal-legend">' +
      '<span><i class="sw-win"></i>Profit</span>' +
      '<span><i class="sw-loss"></i>Rugi</span>' +
      '<span><i class="sw-flat"></i>Impas / belum untung rugi</span>' +
      '<span><i class="sw-none"></i>Tidak ada trade</span>' +
    '</div>' +
    '</div>';

  $('#view').innerHTML = html;

  $('#calPrev').addEventListener('click', function () {
    var d = new Date(calCursor.y, calCursor.m - 1, 1);
    calCursor = { y: d.getFullYear(), m: d.getMonth() };
    renderCalendar();
  });
  $('#calNext').addEventListener('click', function () {
    var d = new Date(calCursor.y, calCursor.m + 1, 1);
    calCursor = { y: d.getFullYear(), m: d.getMonth() };
    renderCalendar();
  });

  $$('.cal-cell[data-day]').forEach(function (cell) {
    cell.addEventListener('click', function () {
      openDayModal(cell.getAttribute('data-day'));
    });
  });
}

function openDayModal(day) {
  var daily = Stats.dailyMap(state.trades);
  var info = daily[day];
  var trades = info ? info.trades : [];
  var pnl = info ? info.pnl : 0;

  var body = trades.length
    ? '<div class="table-wrap"><table><thead><tr>' +
        '<th>Simbol</th><th>Arah</th><th>Hasil</th><th class="num">PnL</th><th class="num">R</th>' +
        '</tr></thead><tbody>' +
        trades.map(function (t) {
          return '<tr><td><b>' + esc(t.symbol) + '</b></td>' +
            '<td>' + sideBadge(t) + '</td>' +
            '<td>' + resultBadge(t) + '</td>' +
            '<td class="num ' + signClass(t.pnl) + '">' +
            (t.status === 'open' ? '-' : esc(fmtSigned(state.settings.currency, t.pnl))) +
            '</td>' +
            '<td class="num ' + signClass(t.rMultiple) + '">' +
            (t.status === 'open' ? '-' : t.rMultiple.toFixed(2) + 'R') +
            '</td></tr>';
        }).join('') +
        '</tbody></table></div>'
    : '<p class="muted" style="margin:0">Tidak ada trade pada tanggal ini.</p>';

  openModal(
    '<div class="modal modal-md">' +
      '<div class="modal-head"><h2>' + esc(shortDate(day)) + '</h2>' +
      '<button class="btn-icon" data-close type="button">Tutup</button></div>' +
      '<div class="modal-body">' +
        (trades.length
          ? '<div class="alert ' + (pnl >= 0 ? 'info' : 'danger') + '">' +
            '<strong>Total hari ini</strong>' +
            '<span class="' + signClass(pnl) + '">' +
            esc(fmtSigned(state.settings.currency, pnl)) + '</span> dari ' +
            trades.length + ' trade</div>'
          : '') +
        body +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-close type="button">Tutup</button>' +
        '<button class="btn btn-primary" id="dayAdd" type="button">Tambah Trade Hari Ini</button>' +
      '</div>' +
    '</div>'
  );
  bindClose();
  $('#dayAdd').addEventListener('click', function () {
    closeModal();
    openTradeModal();
  });
}

/* =========================================================
   ANALITIK
   ========================================================= */

function renderAnalytics() {
  var list = filteredTrades(state.trades, analyticsFilters);
  var closed = Stats.closed(list);
  var cur = state.settings.currency;

  var allSymbols = [];
  state.trades.forEach(function (t) {
    if (allSymbols.indexOf(t.symbol) === -1) allSymbols.push(t.symbol);
  });
  var allTags = [];
  state.trades.forEach(function (t) {
    (t.tags || []).forEach(function (tag) {
      if (allTags.indexOf(tag) === -1) allTags.push(tag);
    });
  });

  var s = Stats.summary({
    settings: state.settings,
    trades: list
  });

  var html = '';

  html += '<div class="card section"><div class="filters">' +
    '<div class="field w-sm"><label>Dari</label>' +
      '<input type="date" id="aFrom" value="' + esc(analyticsFilters.from) + '"></div>' +
    '<div class="field w-sm"><label>Sampai</label>' +
      '<input type="date" id="aTo" value="' + esc(analyticsFilters.to) + '"></div>' +
    '<div class="field w-sm"><label>Simbol</label>' +
      selectHtml('aSymbol', allSymbols, analyticsFilters.symbol) + '</div>' +
    '<div class="field w-sm"><label>Arah</label>' +
      selectHtml('aSide', [
        { value: 'long', label: 'Long' },
        { value: 'short', label: 'Short' }
      ], analyticsFilters.side) + '</div>' +
    '<div class="field w-md"><label>Setup</label>' +
      selectHtml('aSetup', state.setups.map(function (x) {
        return { value: x.id, label: x.name };
      }), analyticsFilters.setup) + '</div>' +
    '<div class="field w-sm"><label>Hasil</label>' +
      selectHtml('aResult', [
        { value: 'win', label: 'Win' },
        { value: 'loss', label: 'Loss' },
        { value: 'be', label: 'Breakeven' },
        { value: 'open', label: 'Open' }
      ], analyticsFilters.result) + '</div>' +
    '<div class="field w-sm"><label>Tag</label>' +
      selectHtml('aTag', allTags, analyticsFilters.tag) + '</div>' +
    '<button class="btn btn-ghost" id="aReset" type="button">Reset</button>' +
  '</div>' +

  '<div class="grid g-4">' +
    statCard('Total PnL', esc(fmtSigned(cur, s.totalPnl)),
      s.closedCount + ' trade selesai', signClass(s.totalPnl)) +
    statCard('Win rate', s.winRate.toFixed(1) + '%',
      s.wins + ' win / ' + s.losses + ' loss') +
    statCard('Expectancy', esc(fmtSigned(cur, s.expectancy)),
      'Rata-rata ' + (s.avgR >= 0 ? '+' : '') + s.avgR.toFixed(2) + 'R per trade',
      signClass(s.expectancy)) +
    statCard('Max Drawdown', esc(fmtMoney(cur, s.maxDrawdown)),
      s.maxDrawdownPct.toFixed(1) + '% dari puncak', 'neg') +
  '</div></div>';

  // Grafik utama
  var monthly = Stats.byMonth(closed);
  var rDist = Stats.rDistribution(closed);

  html += '<div class="grid g-2 section">' +
    '<div class="card"><div class="card-head"><h2>PnL per Bulan</h2></div>' +
      (monthly.length ? Charts.bars({
        labels: monthly.map(function (x) { return monthLabel(x.key); }),
        values: monthly.map(function (x) { return x.pnl; }),
        format: function (v) { return (v > 0 ? '+' : '') + Math.round(v).toLocaleString('id-ID'); },
        colorFn: function (v) { return v >= 0 ? '#22c55e' : '#ef4444'; }
      }) : Charts.empty('Belum ada data')) +
    '</div>' +
    '<div class="card"><div class="card-head"><h2>Distribusi R Multiple</h2></div>' +
      Charts.bars({
        labels: rDist.map(function (x) { return x.label; }),
        values: rDist.map(function (x) { return x.count; }),
        format: function (v) { return String(Math.round(v)); },
        color: '#3b82f6'
      }) +
    '</div>' +
    '</div>';

  // Peringkat
  var bySym = Stats.bySymbol(closed);
  var bySet = Stats.bySetup(closed, state);
  var byWd = Stats.byWeekday(closed);

  html += '<div class="grid g-3 section">' +
    '<div class="card"><div class="card-head"><h2>PnL per Simbol</h2></div>' +
      Charts.hbars({
        items: bySym.map(function (x) { return { label: x.key, value: x.pnl }; }),
        format: function (v) { return fmtSigned(cur, v); }
      }) + '</div>' +
    '<div class="card"><div class="card-head"><h2>PnL per Setup</h2></div>' +
      Charts.hbars({
        items: bySet.map(function (x) { return { label: x.key, value: x.pnl }; }),
        format: function (v) { return fmtSigned(cur, v); },
        emptyMsg: 'Belum ada setup terpilih pada trade'
      }) + '</div>' +
    '<div class="card"><div class="card-head"><h2>PnL per Hari Minggu</h2></div>' +
      Charts.hbars({
        items: byWd.map(function (x) { return { label: x.key, value: x.pnl }; }),
        format: function (v) { return fmtSigned(cur, v); }
      }) + '</div>' +
    '</div>';

  // Tabel detail per simbol
  if (bySym.length) {
    html += '<div class="card section">' +
      '<div class="card-head"><h2>Detail Performa per Simbol</h2></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Simbol</th><th class="num">Trade</th><th class="num">Win Rate</th>' +
        '<th class="num">Risiko</th><th class="num">PnL</th><th class="num">Rata-rata R</th>' +
      '</tr></thead><tbody>' +
      bySym.map(function (x) {
        return '<tr><td><b>' + esc(x.key) + '</b></td>' +
          '<td class="num">' + x.count + '</td>' +
          '<td class="num">' + x.winRate.toFixed(1) + '%</td>' +
          '<td class="num">' + esc(fmtMoney(cur, x.risk)) + '</td>' +
          '<td class="num ' + signClass(x.pnl) + '">' + esc(fmtSigned(cur, x.pnl)) + '</td>' +
          '<td class="num ' + signClass(x.avgR) + '">' +
          (x.avgR >= 0 ? '+' : '') + x.avgR.toFixed(2) + 'R</td></tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }

  // Kualitas: jam, mood, disiplin, tag
  var byHour = Stats.byHour(closed);
  var byMood = Stats.byMood(closed);
  var byQuality = Stats.byQuality(closed);
  var byTag = Stats.byTag(closed);

  html += '<div class="grid g-2 section">' +
    '<div class="card"><div class="card-head"><h2>PnL per Jam Entry</h2></div>' +
      (byHour.length ? Charts.bars({
        labels: byHour.map(function (x) { return x.key; }),
        values: byHour.map(function (x) { return x.pnl; }),
        format: function (v) { return (v > 0 ? '+' : '') + Math.round(v).toLocaleString('id-ID'); },
        colorFn: function (v) { return v >= 0 ? '#22c55e' : '#ef4444'; },
        height: 190
      }) : Charts.empty('Belum ada jam entry tercatat')) + '</div>' +
    '<div class="card"><div class="card-head"><h2>PnL per Mood</h2></div>' +
      (byMood.length ? Charts.hbars({
        items: byMood.map(function (x) { return { label: x.key, value: x.pnl }; }),
        format: function (v) { return fmtSigned(cur, v); }
      }) : Charts.empty('Belum ada mood tercatat')) + '</div>' +
    '</div>';

  html += '<div class="grid g-2 section">' +
    '<div class="card"><div class="card-head"><h2>Kualitas Eksekusi vs Hasil</h2></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Penilaian</th><th class="num">Trade</th><th class="num">Win Rate</th>' +
        '<th class="num">PnL</th></tr></thead><tbody>' +
        byQuality.map(function (x) {
          return '<tr><td>' + esc(x.key) + '</td>' +
            '<td class="num">' + x.count + '</td>' +
            '<td class="num">' + x.winRate.toFixed(1) + '%</td>' +
            '<td class="num ' + signClass(x.pnl) + '">' +
            esc(fmtSigned(cur, x.pnl)) + '</td></tr>';
        }).join('') +
      '</tbody></table></div></div>' +
    '<div class="card"><div class="card-head"><h2>Analisis Disiplin</h2></div>' +
      disciplineTable(closed, cur) +
      (byTag.length
        ? '<h3 style="margin-top:16px">Tag paling sering</h3>' +
          Charts.hbars({
            items: byTag.slice(0, 8).map(function (x) {
              return { label: x.key + ' (' + x.count + ')', value: x.pnl };
            }),
            format: function (v) { return fmtSigned(cur, v); }
          })
        : '') +
    '</div>' +
    '</div>';

  // Pelanggaran aturan
  var violations = Stats.violations(state);
  html += '<div class="card">' +
    '<div class="card-head"><h2>Pelanggaran Aturan Risk Management</h2>' +
    '<span class="badge ' + (violations.length ? 'rule' : 'win') + '">' +
    violations.length + ' temuan</span></div>';

  if (!violations.length) {
    html += '<p class="muted" style="margin:0">Tidak ada pelanggaran aturan tercatat. ' +
      'Pertahankan disiplin.</p>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr>' +
      '<th>Jenis</th><th>Keterangan</th></tr></thead><tbody>' +
      violations.slice(0, 40).map(function (v) {
        return '<tr><td><span class="badge rule">' + esc(v.type) + '</span></td>' +
          '<td class="wrap">' + esc(v.detail) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  html += '</div>';

  $('#view').innerHTML = html;

  var rerender = function () {
    analyticsFilters.from = $('#aFrom').value;
    analyticsFilters.to = $('#aTo').value;
    analyticsFilters.symbol = $('#aSymbol').value;
    analyticsFilters.side = $('#aSide').value;
    analyticsFilters.setup = $('#aSetup').value;
    analyticsFilters.result = $('#aResult').value;
    analyticsFilters.tag = $('#aTag').value;
    renderAnalytics();
  };
  ['#aFrom', '#aTo', '#aSymbol', '#aSide', '#aSetup', '#aResult', '#aTag']
    .forEach(function (sel) { $(sel).addEventListener('change', rerender); });
  $('#aReset').addEventListener('click', function () {
    analyticsFilters = { from: '', to: '', symbol: '', side: '', setup: '', result: '', tag: '' };
    renderAnalytics();
  });
}

function disciplineTable(trades, cur) {
  var groups = [
    { key: 'Disiplin', test: function (t) { return t.disciplined; } },
    { key: 'Melanggar rencana', test: function (t) { return !t.disciplined; } }
  ];

  var rows = groups.map(function (g) {
    var subset = trades.filter(g.test);
    var pnl = subset.reduce(function (a, t) { return a + t.pnl; }, 0);
    var wins = subset.filter(function (t) { return t.result === 'win'; }).length;
    var settled = subset.filter(function (t) { return t.result !== 'be'; }).length;
    var wr = settled ? (wins / settled) * 100 : 0;
    return '<tr><td>' + g.key + '</td>' +
      '<td class="num">' + subset.length + '</td>' +
      '<td class="num">' + wr.toFixed(1) + '%</td>' +
      '<td class="num ' + signClass(pnl) + '">' + esc(fmtSigned(cur, pnl)) + '</td></tr>';
  }).join('');

  return '<div class="table-wrap"><table><thead><tr>' +
    '<th>Kategori</th><th class="num">Trade</th><th class="num">Win Rate</th>' +
    '<th class="num">PnL</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/* =========================================================
   PLAYBOOK
   ========================================================= */

function renderPlaybook() {
  var closed = Stats.closed(state.trades);
  var html = '';

  html += '<div class="card section">' +
    '<div class="card-head"><h2>Daftar Setup Trading</h2>' +
      '<button class="btn btn-primary" id="addSetup" type="button">Tambah Setup</button></div>' +
    '<p class="muted small" style="margin:0">Kumpulkan setup yang sudah terbukti, ' +
    'lengkapi dengan syarat entry dan checklist wajib agar eksekusi konsisten.</p>' +
    '</div>';

  if (!state.setups.length) {
    html += '<div class="empty">' +
      '<div class="title">Belum ada setup</div>' +
      '<div class="desc">Tulis setup pertama Anda, misalnya Pullback Trend atau Breakout Retest, ' +
      'lengkap dengan aturan entry, exit, dan checklist pre-trade.</div>' +
      '<button class="btn btn-primary" id="addSetupEmpty">Tambah Setup Pertama</button>' +
      '</div>';
    $('#view').innerHTML = html;
    $('#addSetup').addEventListener('click', function () { openSetupModal(); });
    $('#addSetupEmpty').addEventListener('click', function () { openSetupModal(); });
    return;
  }

  html += '<div class="grid g-3">';
  state.setups.forEach(function (s) {
    var own = closed.filter(function (t) { return t.setupId === s.id; });
    var wins = own.filter(function (t) { return t.result === 'win'; }).length;
    var settled = own.filter(function (t) { return t.result === 'win' || t.result === 'loss'; }).length;
    var wr = settled ? (wins / settled) * 100 : 0;
    var pnl = own.reduce(function (a, t) { return a + t.pnl; }, 0);

    html += '<div class="setup-card">' +
      '<div class="name">' + esc(s.name) + '</div>' +
      (s.description ? '<div class="desc">' + esc(s.description) + '</div>' : '') +
      (s.entryRules ? '<div class="small"><b>Syarat entry:</b><br>' +
        esc(s.entryRules).replace(/\n/g, '<br>') + '</div>' : '') +
      (s.exitRules ? '<div class="small"><b>Aturan exit:</b><br>' +
        esc(s.exitRules).replace(/\n/g, '<br>') + '</div>' : '') +
      (s.checklist && s.checklist.length
        ? '<div class="small"><b>Checklist (' + s.checklist.length + '):</b><ul style="margin:4px 0 0;padding-left:18px">' +
          s.checklist.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') +
          '</ul></div>'
        : '') +
      '<div class="meta">' +
        '<span>Trade <b>' + own.length + '</b></span>' +
        '<span>Win rate <b>' + wr.toFixed(0) + '%</b></span>' +
        '<span>PnL <b class="' + signClass(pnl) + '">' +
          esc(fmtSigned(state.settings.currency, pnl)) + '</b></span>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn btn-sm" data-setup-edit="' + esc(s.id) + '" type="button">Edit</button>' +
        '<button class="btn btn-danger btn-sm" data-setup-del="' + esc(s.id) + '" type="button">Hapus</button>' +
      '</div>' +
      '</div>';
  });
  html += '</div>';

  $('#view').innerHTML = html;

  $('#addSetup').addEventListener('click', function () { openSetupModal(); });
  $$('[data-setup-edit]').forEach(function (b) {
    b.addEventListener('click', function () {
      openSetupModal(b.getAttribute('data-setup-edit'));
    });
  });
  $$('[data-setup-del]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-setup-del');
      var s = SetupStore.get(state, id);
      confirmDialog('Hapus setup',
        'Hapus setup "' + (s ? s.name : '') + '"? Trade yang memakai setup ini tetap tersimpan.',
        function () {
          SetupStore.remove(state, id);
          refresh();
          toast('Setup dihapus');
        });
    });
  });
}

function openSetupModal(id) {
  var s = id ? SetupStore.get(state, id) : null;
  if (id && !s) return;

  var checklist = s ? (s.checklist || []).slice() : [];

  var renderItems = function () {
    var box = $('#setupItems');
    if (!checklist.length) {
      box.innerHTML = '<div class="hint">Belum ada item checklist.</div>';
      return;
    }
    box.innerHTML = '<div class="check-list">' + checklist.map(function (c, i) {
      return '<div class="check-item">' +
        '<span class="small muted mono">' + (i + 1) + '.</span>' +
        '<label>' + esc(c) + '</label>' +
        '<button type="button" class="rm" data-rm="' + i + '" title="Hapus">&times;</button>' +
        '</div>';
    }).join('') + '</div>';

    $$('[data-rm]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        checklist.splice(Number(b.getAttribute('data-rm')), 1);
        renderItems();
      });
    });
  };

  openModal(
    '<div class="modal">' +
      '<div class="modal-head"><h2>' + (s ? 'Edit Setup' : 'Tambah Setup') + '</h2>' +
      '<button class="btn-icon" data-close type="button">Tutup</button></div>' +
      '<div class="modal-body">' +
        '<div class="field"><label>Nama setup *</label>' +
          '<input type="text" id="sName" placeholder="Pullback Trend" value="' +
          esc(s ? s.name : '') + '"></div>' +
        '<div class="field"><label>Deskripsi singkat</label>' +
          '<textarea id="sDesc" placeholder="Kondisi pasar apa yang dicari...">' +
          esc(s ? s.description : '') + '</textarea></div>' +
        '<div class="form-row">' +
          '<div class="field"><label>Syarat entry (satu baris satu syarat)</label>' +
            '<textarea id="sEntry">' + esc(s ? s.entryRules : '') + '</textarea></div>' +
          '<div class="field"><label>Aturan exit</label>' +
            '<textarea id="sExit">' + esc(s ? s.exitRules : '') + '</textarea></div>' +
        '</div>' +
        '<div class="field"><label>Checklist pre-trade</label>' +
          '<div id="setupItems"></div>' +
          '<div class="add-check">' +
            '<input type="text" id="sCheck" placeholder="Tambah syarat wajib...">' +
            '<button class="btn" id="sAddCheck" type="button">Tambah</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-close type="button">Batal</button>' +
        '<button class="btn btn-primary" id="saveSetup" type="button">Simpan Setup</button>' +
      '</div>' +
    '</div>'
  );
  bindClose();
  renderItems();

  var addItem = function () {
    var val = $('#sCheck').value.trim();
    if (!val) return;
    checklist.push(val);
    $('#sCheck').value = '';
    renderItems();
    $('#sCheck').focus();
  };
  $('#sAddCheck').addEventListener('click', addItem);
  $('#sCheck').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
  });

  $('#saveSetup').addEventListener('click', function () {
    var name = $('#sName').value.trim();
    if (!name) { toast('Nama setup wajib diisi', 'err'); $('#sName').focus(); return; }

    var data = {
      name: name,
      description: $('#sDesc').value.trim(),
      entryRules: $('#sEntry').value.trim(),
      exitRules: $('#sExit').value.trim(),
      checklist: checklist
    };

    if (s) SetupStore.update(state, s.id, data);
    else SetupStore.add(state, data);

    closeModal();
    refresh();
    toast(s ? 'Setup diperbarui' : 'Setup tersimpan', 'ok');
  });
}

/* =========================================================
   RISK & PLAN
   ========================================================= */

function renderRisk() {
  var set = state.settings;
  var plan = state.plan;
  var html = '';

  html += '<div class="grid g-2 section">' +

    '<div class="card">' +
      '<div class="card-head"><h2>Aturan Risiko</h2></div>' +
      '<div class="field"><label>Risiko maksimal per trade (%)</label>' +
        '<input type="number" step="0.1" id="rRiskPct" value="' + esc(set.maxRiskPctTrade) + '">' +
        '<div class="hint">Dari modal awal, saat ini setara ' +
        esc(fmtMoney(set.currency, set.initialCapital * set.maxRiskPctTrade / 100)) +
        ' per trade.</div></div>' +
      '<div class="field"><label>Batas rugi harian (%)</label>' +
        '<input type="number" step="0.1" id="rDailyPct" value="' + esc(set.maxDailyLossPct) + '">' +
        '<div class="hint">Saat ini setara ' +
        esc(fmtMoney(set.currency, set.initialCapital * set.maxDailyLossPct / 100)) +
        ' per hari.</div></div>' +
      '<div class="field"><label>Batas rugi beruntun (kali)</label>' +
        '<input type="number" step="1" id="rStreak" value="' + esc(set.maxLossStreak) + '">' +
        '<div class="hint">Berhenti trading setelah rugi beruntun sebanyak ini.</div></div>' +
      '<button class="btn btn-primary" id="saveRules" type="button">Simpan Aturan</button>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-head"><h2>Trading Plan</h2></div>' +
      '<div class="field"><label>Target / Tujuan</label>' +
        '<textarea id="pGoal" placeholder="Misal: naik 5% per bulan dengan drawdown maks 10%">' +
        esc(plan.goal) + '</textarea></div>' +
      '<div class="field"><label>Simbol yang boleh diperdagangkan</label>' +
        '<input type="text" id="pSymbols" placeholder="EURUSD, XAUUSD" value="' +
        esc(plan.allowedSymbols) + '"></div>' +
      '<div class="field"><label>Jam trading yang diizinkan</label>' +
        '<input type="text" id="pHours" placeholder="08:00 - 11:00 WIB" value="' +
        esc(plan.allowedHours) + '"></div>' +
      '<div class="field"><label>Aturan dan larangan</label>' +
        '<textarea id="pRules" placeholder="Satu baris satu aturan">' +
        esc(plan.rules) + '</textarea></div>' +
      '<button class="btn btn-primary" id="savePlan" type="button">Simpan Plan</button>' +
    '</div>' +
    '</div>';

  // Checklist sesi
  html += '<div class="grid g-2">' +
    '<div class="card">' +
      '<div class="card-head"><h2>Checklist Sebelum Sesi</h2></div>' +
      '<div class="check-list" id="preList">' + checklistHtml(state.sessionChecklist) + '</div>' +
      '<div class="add-check">' +
        '<input type="text" id="preInput" placeholder="Tambah item checklist...">' +
        '<button class="btn" id="preAdd" type="button">Tambah</button>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><h2>Checklist Setelah Sesi</h2></div>' +
      '<div class="check-list" id="postList">' + checklistHtml(state.postChecklist) + '</div>' +
      '<div class="add-check">' +
        '<input type="text" id="postInput" placeholder="Tambah item checklist...">' +
        '<button class="btn" id="postAdd" type="button">Tambah</button>' +
      '</div>' +
    '</div>' +
    '</div>';

  // Ringkasan pelanggaran
  var violations = Stats.violations(state);
  html += '<div class="card" style="margin-top:16px">' +
    '<div class="card-head"><h2>Riwayat Pelanggaran</h2>' +
    '<span class="badge ' + (violations.length ? 'rule' : 'win') + '">' +
    violations.length + ' temuan</span></div>' +
    (violations.length
      ? '<ul class="small" style="margin:0;padding-left:18px;line-height:1.9">' +
        violations.slice(0, 15).map(function (v) {
          return '<li><b>' + esc(v.type) + ':</b> ' + esc(v.detail) + '</li>';
        }).join('') + '</ul>'
      : '<p class="muted small" style="margin:0">Belum ada pelanggaran.</p>') +
    '</div>';

  $('#view').innerHTML = html;

  $('#saveRules').addEventListener('click', function () {
    set.maxRiskPctTrade = Math.max(0, Number($('#rRiskPct').value) || 0);
    set.maxDailyLossPct = Math.max(0, Number($('#rDailyPct').value) || 0);
    set.maxLossStreak = Math.max(0, Math.round(Number($('#rStreak').value) || 0));
    refresh();
    toast('Aturan risiko disimpan', 'ok');
  });

  $('#savePlan').addEventListener('click', function () {
    plan.goal = $('#pGoal').value.trim();
    plan.allowedSymbols = $('#pSymbols').value.trim();
    plan.allowedHours = $('#pHours').value.trim();
    plan.rules = $('#pRules').value.trim();
    refresh();
    toast('Trading plan disimpan', 'ok');
  });

  bindChecklist('preList', 'preInput', 'preAdd', state.sessionChecklist);
  bindChecklist('postList', 'postInput', 'postAdd', state.postChecklist);
}

function checklistHtml(items) {
  return items.map(function (c) {
    return '<div class="check-item' + (c.done ? ' checked' : '') + '">' +
      '<input type="checkbox" id="chk_' + esc(c.id) + '" data-chk="' + esc(c.id) + '"' +
      (c.done ? ' checked' : '') + '>' +
      '<label for="chk_' + esc(c.id) + '">' + esc(c.text) + '</label>' +
      '<button type="button" class="rm" data-chk-rm="' + esc(c.id) + '" title="Hapus">&times;</button>' +
      '</div>';
  }).join('');
}

function bindChecklist(listId, inputId, btnId, arr) {
  var rerender = function () {
    $('#' + listId).innerHTML = checklistHtml(arr);
    bindItems();
  };

  var bindItems = function () {
    $$('[data-chk]', $('#' + listId)).forEach(function (box) {
      box.addEventListener('change', function () {
        var item = arr.filter(function (c) { return c.id === box.getAttribute('data-chk'); })[0];
        if (item) item.done = box.checked;
        var parent = box.closest('.check-item');
        if (parent) parent.classList.toggle('checked', box.checked);
        save();
      });
    });
    $$('[data-chk-rm]', $('#' + listId)).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-chk-rm');
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].id === id) { arr.splice(i, 1); break; }
        }
        rerender();
        save();
      });
    });
  };

  var add = function () {
    var val = $('#' + inputId).value.trim();
    if (!val) return;
    arr.push({ id: uid('c'), text: val, done: false });
    $('#' + inputId).value = '';
    rerender();
    save();
    $('#' + inputId).focus();
  };

  $('#' + btnId).addEventListener('click', add);
  $('#' + inputId).addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });

  bindItems();
}

/* =========================================================
   PENGATURAN
   ========================================================= */

function renderSettings() {
  var set = state.settings;
  var openCount = Stats.open(state.trades).length;

  var html = '<div class="grid g-2 section">' +

    '<div class="card">' +
      '<div class="card-head"><h2>Profil Modal</h2></div>' +
      '<div class="field"><label>Modal awal</label>' +
        '<input type="number" step="any" id="setCapital" value="' + esc(set.initialCapital) + '"></div>' +
      '<div class="field"><label>Simbol mata uang</label>' +
        '<input type="text" id="setCurrency" maxlength="4" value="' + esc(set.currency) + '">' +
        '<div class="hint">Contoh: $ atau Rp</div></div>' +
      '<button class="btn btn-primary" id="saveSettings" type="button">Simpan</button>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-head"><h2>Statistik Data</h2></div>' +
      '<div class="kv">' +
        '<dt>Total trade</dt><dd>' + state.trades.length + '</dd>' +
        '<dt>Posisi terbuka</dt><dd>' + openCount + '</dd>' +
        '<dt>Jumlah setup</dt><dd>' + state.setups.length + '</dd>' +
        '<dt>Checklist sesi</dt><dd>' + state.sessionChecklist.length + ' sebelum, ' +
          state.postChecklist.length + ' sesudah</dd>' +
        '<dt>Perkiraan ukuran data</dt><dd>' + estimateSize() + '</dd>' +
      '</div>' +
      '<p class="muted small" style="margin-top:14px">Data tersimpan di browser ini saja ' +
      '(localStorage). Gunakan ekspor berkala agar tidak kehilangan catatan bila ' +
      'browser dibersihkan.</p>' +
    '</div>' +
    '</div>';

  html += '<div class="card">' +
    '<div class="card-head"><h2>Cadangan dan Pemulihan</h2></div>' +
    '<div class="grid g-3">' +
      '<div>' +
        '<h3>Ekspor</h3>' +
        '<p class="muted small">Unduh seluruh data sebagai berkas.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn" id="expJson" type="button">Ekspor JSON</button>' +
          '<button class="btn" id="expCsv" type="button">Ekspor CSV</button>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<h3>Impor</h3>' +
        '<p class="muted small">Memuat berkas JSON akan menimpa data saat ini.</p>' +
        '<input type="file" id="impFile" accept="application/json,.json">' +
      '</div>' +
      '<div>' +
        '<h3>Reset</h3>' +
        '<p class="muted small">Hapus semua data dan kembali ke kondisi awal.</p>' +
        '<button class="btn btn-danger" id="resetData" type="button">Hapus Semua Data</button>' +
      '</div>' +
    '</div>' +
    '</div>';

  html += '<div class="card" style="margin-top:16px">' +
    '<div class="card-head"><h2>Pintasan Keyboard</h2></div>' +
    '<div class="kv">' +
      '<dt>Esc</dt><dd>Tutup jendela dialog</dd>' +
      '<dt>Tab</dt><dd>Pindah antar kolom isian</dd>' +
      '<dt>Enter</dt><dd>Tambah item checklist</dd>' +
    '</div>' +
    '</div>';

  $('#view').innerHTML = html;

  $('#saveSettings').addEventListener('click', function () {
    set.initialCapital = Math.max(0, Number($('#setCapital').value) || 0);
    var cur = $('#setCurrency').value.trim();
    set.currency = cur || '$';
    refresh();
    toast('Pengaturan disimpan', 'ok');
  });

  $('#expJson').addEventListener('click', function () {
    DataPort.exportJSON(state);
    toast('Berkas JSON diunduh', 'ok');
  });
  $('#expCsv').addEventListener('click', function () {
    DataPort.exportCSV(state);
    toast('Berkas CSV diunduh', 'ok');
  });

  $('#impFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    DataPort.importJSON(file, function (err, imported) {
      if (err) {
        toast('Berkas tidak valid: ' + err.message, 'err');
        return;
      }
      confirmDialog('Impor data',
        'Timpa semua data saat ini dengan isi berkas "' + file.name + '"? ' +
        '(' + imported.trades.length + ' trade, ' + imported.setups.length + ' setup)',
        function () {
          state = imported;
          refresh();
          toast('Data berhasil diimpor', 'ok');
        },
        'Impor');
    });
    this.value = '';
  });

  $('#resetData').addEventListener('click', function () {
    confirmDialog('Hapus semua data',
      'Seluruh trade, setup, checklist, dan pengaturan akan dihapus permanen. ' +
      'Lanjutkan?',
      function () {
        state = Storage.reset();
        refresh();
        toast('Semua data dihapus');
      },
      'Hapus Semua');
  });
}

function estimateSize() {
  try {
    var raw = JSON.stringify(state);
    var kb = new Blob([raw]).size / 1024;
    return kb < 1024 ? kb.toFixed(1) + ' KB' : (kb / 1024).toFixed(2) + ' MB';
  } catch (e) {
    return 'tidak dapat dihitung';
  }
}

/* =========================================================
   INIT
   ========================================================= */

$('#quickAdd').addEventListener('click', function () { openTradeModal(); });

$('#menuBtn').addEventListener('click', function () {
  $('#sidebar').classList.toggle('open');
});

window.addEventListener('hashchange', route);

if (!location.hash) location.hash = '#/dashboard';
route();
