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
  if (!ok) toast(t('Gagal menyimpan. Penyimpanan browser mungkin penuh.'), 'err');
  if (typeof Cloud !== 'undefined') Cloud.schedulePush();
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
        '<button class="btn btn-ghost" data-close>' + t('Batal') + '</button>' +
        '<button class="btn btn-danger" id="confirmOk">' + esc(okLabel || t('Hapus')) + '</button>' +
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
  var html = '<option value="">' + t('Tanpa setup') + '</option>';
  state.setups.forEach(function (s) {
    html += '<option value="' + esc(s.id) + '"' +
      (s.id === selected ? ' selected' : '') + '>' + esc(s.name) + '</option>';
  });
  return html;
}

function selectHtml(id, options, selected, placeholder) {
  var html = '<select id="' + id + '">';
  if (placeholder !== null) {
    html += '<option value="">' + esc(placeholder || t('Semua')) + '</option>';
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

function resultBadge(tr) {
  var map = {
    win: ['win', t('Win')],
    loss: ['loss', t('Loss')],
    open: ['open', t('Open')],
    be: ['be', t('Breakeven')]
  };
  var m = map[tr.result] || ['be', '-'];
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
  dashboard: { title: t('Dashboard'), render: renderDashboard },
  trades: { title: t('Log Transaksi'), render: renderTrades },
  calendar: { title: t('Kalender'), render: renderCalendar },
  analytics: { title: t('Analitik'), render: renderAnalytics },
  playbook: { title: t('Playbook'), render: renderPlaybook },
  risk: { title: t('Risk & Plan'), render: renderRisk },
  settings: { title: t('Pengaturan'), render: renderSettings }
};

function route() {
  if (typeof Cloud !== 'undefined' && Cloud.needLogin()) {
    Cloud.renderAuth();
    window.scrollTo(0, 0);
    if (window.innerWidth <= 860) $('#sidebar').classList.remove('open');
    return;
  }

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
  if (typeof Cloud !== 'undefined') {
    $('#accountBox').innerHTML = Cloud.accountHtml();
  }
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
    html += '<div class="alert danger"><strong>' + t('Batas rugi harian tercapai') + '</strong>' +
      t('P/L hari ini {pnl} sudah menyentuh batas {limit}. Sebaiknya hentikan trading hari ini.',
        { pnl: fmtSigned(cur, today.pnl), limit: fmtMoney(cur, today.dailyLimit) }) +
      '</div>';
  } else if (today.hitRisk) {
    html += '<div class="alert warn"><strong>' + t('Total risiko hari ini melebihi batas') + '</strong>' +
      t('Risiko terpakai {used} dari batas {limit} per hari.',
        { used: fmtMoney(cur, today.riskUsed), limit: fmtMoney(cur, today.riskLimit) }) +
      '</div>';
  }

  if (s.currentStreak.type === 'loss' && s.currentStreak.count >= state.settings.maxLossStreak) {
    html += '<div class="alert danger"><strong>' + t('Rugi beruntun') + '</strong>' +
      t('Anda mengalami {n} rugi beruntun. Batasi diri sesuai aturan risk management.',
        { n: s.currentStreak.count }) +
      '</div>';
  }

  if (!state.trades.length) {
    html += '<div class="empty">' +
      '<div class="title">' + t('Belum ada data transaksi') + '</div>' +
      '<div class="desc">' + t('Mulai dengan mencatat trade pertama Anda, atau atur modal dan aturan risiko di halaman Pengaturan.') + '</div>' +
      '<button class="btn btn-primary" id="emptyAdd">' + t('Tambah Trade Pertama') + '</button>' +
      '</div>';
    $('#view').innerHTML = html;
    $('#emptyAdd').addEventListener('click', function () { openTradeModal(); });
    return;
  }

  // Kartu statistik
  html += '<div class="grid g-6 section">' +
    statCard(t('Total P/L'), esc(fmtSigned(cur, s.totalPnl)),
      t('ROI {v}% dari modal', { v: s.roi.toFixed(1) }), signClass(s.totalPnl)) +
    statCard(t('Win Rate'), s.winRate.toFixed(1) + '%',
      t('{w} menang / {l} kalah', { w: s.wins, l: s.losses })) +
    statCard(t('Profit Factor'),
      isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : 'n/a',
      t('Gross win {m}', { m: fmtMoney(cur, s.grossWin) })) +
    statCard(t('Rata-rata R'), (s.avgR >= 0 ? '+' : '') + s.avgR.toFixed(2) + 'R',
      t('Expectancy {m}/trade', { m: fmtSigned(cur, s.expectancy) }), signClass(s.avgR)) +
    statCard(t('Max Drawdown'), esc(fmtMoney(cur, s.maxDrawdown)),
      t('{v}% dari puncak', { v: s.maxDrawdownPct.toFixed(1) }), 'neg') +
    statCard(t('Total Trade'), String(s.closedCount),
      t('{n} posisi terbuka', { n: s.openCount })) +
    '</div>';

  // Equity curve + donut
  var eqLabels = s.equity.map(function (p, i) {
    return i === 0 ? t('Awal') : shortDate(p.date);
  });
  var eqValues = s.equity.map(function (p) { return p.value; });

  html += '<div class="grid g-32 section">' +
    '<div class="card">' +
      '<div class="card-head"><h2>' + t('Equity Curve') + '</h2>' +
      '<span class="small muted">' + t('Modal akhir {m}', { m: fmtMoney(cur, s.capitalNow) }) + '</span></div>' +
      Charts.line({
        values: eqValues,
        labels: eqLabels,
        height: 240,
        format: function (v) { return cur + Math.round(v).toLocaleString(numLocale()); }
      }) +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><h2>' + t('Komposisi Hasil') + '</h2></div>' +
      Charts.donut({
        parts: [
          { label: t('Win'), value: s.wins, color: '#22c55e' },
          { label: t('Loss'), value: s.losses, color: '#ef4444' },
          { label: t('Breakeven'), value: s.breakevens, color: '#6b7a89' }
        ]
      }) +
      '<div style="margin-top:16px" class="kv">' +
        '<dt>' + t('Rentetan sekarang') + '</dt><dd>' +
          (s.currentStreak.type === 'none' ? t('Tidak ada') :
            s.currentStreak.type === 'win'
              ? t('{n} win', { n: s.currentStreak.count })
              : t('{n} loss', { n: s.currentStreak.count })) + '</dd>' +
        '<dt>' + t('Rentetan menang terpanjang') + '</dt><dd>' + s.bestWinStreak + '</dd>' +
        '<dt>' + t('Rentetan kalah terpanjang') + '</dt><dd>' + s.worstLossStreak + '</dd>' +
        '<dt>' + t('Rata-rata per trade') + '</dt><dd class="' + signClass(s.avgPerTrade) + '">' +
          esc(fmtSigned(cur, s.avgPerTrade)) + '</dd>' +
      '</div>' +
    '</div>' +
    '</div>';

  // Perbandingan bulan + PnL bulanan
  var cmp = Stats.monthCompare(state.trades);
  var monthly = Stats.byMonth(Stats.closed(state.trades));

  html += '<div class="grid g-2 section">' +
    '<div class="card">' +
      '<div class="card-head"><h2>' + t('PnL Bulanan') + '</h2></div>' +
      (monthly.length
        ? Charts.bars({
            labels: monthly.map(function (m) { return monthLabel(m.key); }),
            values: monthly.map(function (m) { return m.pnl; }),
            format: function (v) {
              return (v > 0 ? '+' : '') + Math.round(v).toLocaleString(numLocale());
            },
            colorFn: function (v) { return v >= 0 ? '#22c55e' : '#ef4444'; }
          })
        : Charts.empty(t('Belum ada trade tertutup'))) +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><h2>' + t('Perbandingan Bulan') + '</h2></div>' +
      '<div class="kv">' +
        '<dt>' + esc(monthLabel(cmp.thisKey)) + '</dt>' +
        '<dd class="' + signClass(cmp.thisPnl) + '"><b>' +
          esc(fmtSigned(cur, cmp.thisPnl)) + '</b> ' +
          t('dari {n} trade', { n: cmp.thisCount }) + '</dd>' +
        '<dt>' + esc(monthLabel(cmp.prevKey)) + '</dt>' +
        '<dd class="' + signClass(cmp.prevPnl) + '"><b>' +
          esc(fmtSigned(cur, cmp.prevPnl)) + '</b> ' +
          t('dari {n} trade', { n: cmp.prevCount }) + '</dd>' +
        '<dt>' + t('Perubahan') + '</dt><dd class="' +
          signClass(cmp.thisPnl - cmp.prevPnl) + '"><b>' +
          esc(fmtSigned(cur, cmp.thisPnl - cmp.prevPnl)) + '</b></dd>' +
      '</div>' +
      '<div style="margin-top:14px">' +
        '<h3>' + t('Target risiko hari ini') + '</h3>' +
        '<div class="meter-row">' +
          '<div class="lbl"><span>' + t('Risiko terpakai') + '</span>' +
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
    '<div class="card-head"><h2>' + t('Trade Terakhir') + '</h2>' +
    '<a href="#/trades" class="btn btn-ghost btn-sm">' + t('Lihat Semua') + '</a></div>' +
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
    return '<div class="empty"><div class="title">' + t('Tidak ada trade') + '</div>' +
      '<div class="desc">' +
      (opts.emptyMsg || t('Belum ada transaksi yang cocok dengan filter ini.')) +
      '</div></div>';
  }

  var rows = trades.map(function (tr) {
    return '<tr data-id="' + esc(tr.id) + '">' +
      '<td>' + esc(shortDateTime(tr.entryDate)) + '</td>' +
      '<td><b>' + esc(tr.symbol) + '</b></td>' +
      '<td>' + sideBadge(tr) + '</td>' +
      '<td>' + resultBadge(tr) + '</td>' +
      (opts.compact ? '' :
        '<td class="num">' + esc(String(tr.entryPrice || '-')) + '</td>' +
        '<td class="num">' + esc(String(tr.exitPrice || '-')) + '</td>' +
        '<td class="num">' + esc(tr.lot ? String(tr.lot) : '-') + '</td>') +
      '<td class="num muted">' + esc(fmtMoney(state.settings.currency, tr.risk)) + '</td>' +
      '<td class="num ' + signClass(tr.pnl) + '">' +
        (tr.status === 'open' ? '-' : esc(fmtSigned(state.settings.currency, tr.pnl))) + '</td>' +
      '<td class="num ' + signClass(tr.rMultiple) + '">' +
        (tr.status === 'open' ? '-' : (tr.rMultiple >= 0 ? '+' : '') + tr.rMultiple.toFixed(2) + 'R') + '</td>' +
      '<td>' + esc(setupName(tr.setupId) || '-') + '</td>' +
      (opts.compact ? '' : '<td>' + tagsHtml(tr.tags) + '</td>') +
      '<td class="num">' +
        '<button class="btn-icon" data-act="edit" data-id="' + esc(tr.id) + '">' + t('Edit') + '</button> ' +
        '<button class="btn-icon" data-act="del" data-id="' + esc(tr.id) + '">' + t('Hapus') + '</button>' +
      '</td>' +
      '</tr>';
  }).join('');

  return '<div class="table-wrap"><table>' +
    '<thead><tr>' +
      '<th>' + t('Tanggal') + '</th><th>' + t('Simbol') + '</th><th>' + t('Arah') + '</th><th>' + t('Hasil') + '</th>' +
      (opts.compact ? '' : '<th class="num">' + t('Entry') + '</th><th class="num">' + t('Exit') + '</th><th class="num">' + t('Lot') + '</th>') +
      '<th class="num">' + t('Risiko') + '</th><th class="num">' + t('PnL') + '</th><th class="num">' + t('R') + '</th>' +
      '<th>' + t('Setup') + '</th>' + (opts.compact ? '' : '<th>' + t('Tag') + '</th>') +
      '<th class="num">' + t('Aksi') + '</th>' +
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
      '<div class="field w-md"><label>' + t('Cari') + '</label>' +
        '<input type="search" id="fQ" placeholder="' + t('Simbol, catatan, tag...') + '" value="' +
        esc(tradeFilters.q) + '"></div>' +
      '<div class="field w-sm"><label>' + t('Status') + '</label>' +
        selectHtml('fStatus', [
          { value: 'closed', label: t('Selesai') },
          { value: 'open', label: t('Terbuka') }
        ], tradeFilters.status) + '</div>' +
      '<div class="field w-sm"><label>' + t('Arah') + '</label>' +
        selectHtml('fSide', [
          { value: 'long', label: t('Long') },
          { value: 'short', label: t('Short') }
        ], tradeFilters.side) + '</div>' +
      '<div class="field w-md"><label>' + t('Setup') + '</label>' +
        selectHtml('fSetup', state.setups.map(function (s) {
          return { value: s.id, label: s.name };
        }), tradeFilters.setup) + '</div>' +
      '<div class="field w-sm"><label>' + t('Dari') + '</label>' +
        '<input type="date" id="fFrom" value="' + esc(tradeFilters.from) + '"></div>' +
      '<div class="field w-sm"><label>' + t('Sampai') + '</label>' +
        '<input type="date" id="fTo" value="' + esc(tradeFilters.to) + '"></div>' +
      '<button class="btn btn-ghost" id="fReset" type="button">' + t('Reset') + '</button>' +
    '</div>' +

    '<div class="grid g-4">' +
      statCard(t('Trade'), String(list.length),
        t('{n} masih terbuka', { n: Stats.open(list).length })) +
      statCard(t('PnL'), esc(fmtSigned(state.settings.currency, totalPnl)),
        t('Total risiko {m}', { m: fmtMoney(state.settings.currency, totalRisk) }),
        signClass(totalPnl)) +
      statCard(t('Win rate'), wr.toFixed(1) + '%',
        t('{w} menang dari {n} selesai', { w: wins, n: closed.length })) +
      statCard(t('Rata-rata R'),
        closed.length
          ? ((closed.reduce(function (a, t) { return a + t.rMultiple; }, 0) / closed.length).toFixed(2)) + 'R'
          : '0.00R',
        '', '') +
    '</div>' +
    '</div>';

  html += tradeTable(list, { emptyMsg: t('Tidak ada trade yang cocok. Ubah filter atau tambah trade baru.') });

  if (list.length) {
    html += '<div class="table-foot">' +
      '<span>' + t('Menampilkan {a} dari {b} trade', { a: list.length, b: state.trades.length }) + '</span>' +
      '<span>' + t('Total PnL: ') + '<b class="' + signClass(totalPnl) + '">' +
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
      var tr = TradeStore.get(state, id);
      confirmDialog(t('Hapus trade'),
        t('Hapus trade {info}? Tindakan ini tidak bisa dibatalkan.',
          { info: tr ? tr.symbol + ' pada ' + shortDate(tr.entryDate) : t('ini') }),
        function () {
          TradeStore.remove(state, id);
          refresh();
          toast(t('Trade dihapus'));
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
  var tr = id ? TradeStore.get(state, id) : null;
  if (id && !tr) return;
  pendingShot = tr && tr.screenshot ? tr.screenshot : '';

  var v = tr || {
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
      '<h2>' + (tr ? t('Edit Trade') : t('Tambah Trade')) + '</h2>' +
      '<button class="btn-icon" data-close type="button">' + t('Tutup') + '</button>' +
    '</div>' +
    '<div class="modal-body">' +
      '<form id="tradeForm">' +

        '<fieldset><legend>' + t('Identitas Transaksi') + '</legend>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>' + t('Simbol / Pair *') + '</label>' +
              '<input type="text" id="tSymbol" required placeholder="EURUSD, BTCUSD..." value="' +
              esc(v.symbol) + '"></div>' +
            '<div class="field"><label>' + t('Pasar') + '</label>' +
              selectHtml('tMarket', MARKETS.map(function (m) { return { value: m, label: t(m) }; }), v.market, null) + '</div>' +
            '<div class="field"><label>' + t('Arah') + '</label>' +
              selectHtml('tSide', [
                { value: 'long', label: t('Long / Buy') },
                { value: 'short', label: t('Short / Sell') }
              ], v.side, null) + '</div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>' + t('Waktu entry') + '</label>' +
              '<input type="datetime-local" id="tEntryDate" value="' + esc(v.entryDate) + '"></div>' +
            '<div class="field"><label>' + t('Waktu exit') + '</label>' +
              '<input type="datetime-local" id="tExitDate" value="' + esc(v.exitDate) + '"></div>' +
            '<div class="field"><label>' + t('Status posisi') + '</label>' +
              selectHtml('tStatus', [
                { value: 'closed', label: t('Selesai (closed)') },
                { value: 'open', label: t('Masih terbuka') }
              ], v.status, null) + '</div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset><legend>' + t('Harga dan Ukuran Posisi') + '</legend>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>' + t('Harga entry') + '</label>' +
              '<input type="number" step="any" id="tEntryPrice" value="' + esc(v.entryPrice) + '"></div>' +
            '<div class="field"><label>' + t('Harga exit') + '</label>' +
              '<input type="number" step="any" id="tExitPrice" value="' + esc(v.exitPrice) + '"></div>' +
            '<div class="field"><label>' + t('Lot / Ukuran') + '</label>' +
              '<input type="number" step="any" id="tLot" value="' + esc(v.lot) + '"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>' + t('Stop Loss') + '</label>' +
              '<input type="number" step="any" id="tSL" value="' + esc(v.sl) + '"></div>' +
            '<div class="field"><label>' + t('Take Profit') + '</label>' +
              '<input type="number" step="any" id="tTP" value="' + esc(v.tp) + '"></div>' +
            '<div class="field"><label>' + t('Pips / Poin') + '</label>' +
              '<input type="number" step="any" id="tPips" value="' + esc(v.pips) + '"></div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset><legend>' + t('Risiko dan Hasil') + '</legend>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>' + t('Risiko ({c})', { c: state.settings.currency }) + '</label>' +
              '<input type="number" step="any" id="tRisk" value="' + esc(v.risk) + '"></div>' +
            '<div class="field"><label>' + t('PnL / Hasil ({c})', { c: state.settings.currency }) + '</label>' +
              '<input type="number" step="any" id="tPnl" value="' + esc(v.pnl) + '"></div>' +
            '<div class="field"><label>' + t('R Multiple') + '</label>' +
              '<input type="number" step="0.01" id="tR" placeholder="' + t('otomatis dari risiko') + '">' +
              '<div class="hint" id="rPreview"></div></div>' +
          '</div>' +
        '</fieldset>' +

        '<fieldset><legend>' + t('Setup dan Kualitas') + '</legend>' +
          '<div class="form-row">' +
            '<div class="field"><label>' + t('Setup / Strategy') + '</label>' +
              '<select id="tSetup">' + setupOptions(v.setupId) + '</select></div>' +
            '<div class="field"><label>' + t('Tag (pisahkan dengan koma)') + '</label>' +
              '<input type="text" id="tTags" placeholder="breakout, pullback, fomo" value="' +
              esc(tagsStr) + '"></div>' +
          '</div>' +
          '<div class="form-row-3">' +
            '<div class="field"><label>' + t('Kualitas eksekusi') + '</label>' +
              selectHtml('tQuality', ['1', '2', '3', '4', '5'], v.quality ? String(v.quality) : '', t('Belum dinilai')) + '</div>' +
            '<div class="field"><label>' + t('Mood') + '</label>' +
              selectHtml('tMood', MOODS.map(function (m) { return { value: m, label: t(m) }; }), v.mood) + '</div>' +
            '<div class="field"><label>' + t('Disiplin pada rencana') + '</label>' +
              selectHtml('tDisciplined', [
                { value: 'ya', label: t('Ya, disiplin') },
                { value: 'tidak', label: t('Tidak, melanggar') }
              ], v.disciplined ? 'ya' : '') + '</div>' +
          '</div>' +
          '<div id="setupChecklist"></div>' +
        '</fieldset>' +

        '<fieldset><legend>' + t('Catatan dan Screenshot') + '</legend>' +
          '<div class="field"><label>' + t('Catatan / Pelajaran') + '</label>' +
            '<textarea id="tNotes" placeholder="' + t('Apa yang terjadi, apa yang dipelajari...') + '">' +
            esc(v.notes) + '</textarea></div>' +
          '<div class="field"><label>' + t('Screenshot chart') + '</label>' +
            '<input type="file" id="tShot" accept="image/*">' +
            '<div id="shotPreview"></div>' +
          '</div>' +
        '</fieldset>' +

      '</form>' +
    '</div>' +
    '<div class="modal-foot">' +
      (tr ? '<button class="btn btn-danger left" id="delTrade" type="button">' + t('Hapus Trade') + '</button>' : '') +
      '<button class="btn btn-ghost" data-close type="button">' + t('Batal') + '</button>' +
      '<button class="btn btn-primary" id="saveTrade" type="button">' + t('Simpan Trade') + '</button>' +
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
      ? t('Hasil: {r}R', { r: (r >= 0 ? '+' : '') + r.toFixed(2) })
      : t('Isi risiko untuk menghitung R');
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
    box.innerHTML = '<div class="field"><label>' + t('Checklist pre-trade: {name}', { name: esc(setup.name) }) + '</label><div class="check-list">' +
      setup.checklist.map(function (c, i) {
        return '<div class="check-item">' +
          '<input type="checkbox" id="sc_' + i + '">' +
          '<label for="sc_' + i + '">' + esc(c) + '</label></div>';
      }).join('') + '</div>' +
      '<div class="hint">' + t('Centang bila syarat ini terpenuhi sebelum entry.') + '</div></div>';
  };
  $('#tSetup').addEventListener('change', renderChecklist);
  renderChecklist();

  // Screenshot
  var renderShot = function () {
    var box = $('#shotPreview');
    if (!pendingShot) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="shot-preview">' +
      '<img src="' + pendingShot + '" alt="Screenshot chart">' +
      '<button type="button" class="rm" id="rmShot">' + t('Hapus') + '</button></div>';
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
      toast(t('Simbol wajib diisi'), 'err');
      $('#tSymbol').focus();
      return;
    }

    var btn = $('#saveTrade');
    btn.disabled = true;
    btn.textContent = t('Menyimpan...');

    var newId = tr ? tr.id : uid('tr');

    var finish = function () {
      var isOpen = $('#tStatus').value === 'open';
      var data = {
        id: newId,
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

      if (tr) TradeStore.update(state, tr.id, data);
      else TradeStore.add(state, data);

      closeModal();
      refresh();
      toast(tr ? t('Trade diperbarui') : t('Trade tersimpan'), 'ok');
    };

    // Mode cloud: unggah screenshot ke Storage dulu agar tersinkron.
    if (typeof Cloud !== 'undefined' && Cloud.configured() && Cloud.user &&
        pendingShot && pendingShot.indexOf('data:') === 0) {
      Cloud.uploadShot(pendingShot, newId).then(function (url) {
        if (url) pendingShot = url;
        else toast(t('Screenshot gagal diunggah, tersimpan lokal saja'), 'err');
        finish();
      });
    } else {
      finish();
    }
  });

  if (tr) {
    $('#delTrade').addEventListener('click', function () {
      confirmDialog(t('Hapus trade'), t('Hapus trade {sym} ini?', { sym: tr.symbol }),
        function () {
          TradeStore.remove(state, tr.id);
          closeModal();
          refresh();
          toast(t('Trade dihapus'));
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
        toast(t('Ukuran gambar masih besar, kualitas dikurangi'), 'err');
        out = canvas.toDataURL('image/jpeg', 0.45);
      }
      cb(out);
    };
    img.onerror = function () { toast(t('Gambar tidak bisa dibaca'), 'err'); };
    img.src = e.target.result;
  };
  reader.onerror = function () { toast(t('Gambar tidak bisa dibaca'), 'err'); };
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

  var dowNames = shortDowNames();
  var html = '<div class="card">' +
    '<div class="cal-head">' +
      '<button class="btn btn-ghost btn-sm" id="calPrev" type="button">' + t('Bulan Sebelumnya') + '</button>' +
      '<div class="cal-title">' + monthLabel(monthKey) +
        ' <span class="muted small">- ' + monthTrades + ' trade, ' +
        '<b class="' + signClass(monthPnl) + '">' +
        esc(fmtSigned(state.settings.currency, monthPnl)) + '</b></span></div>' +
      '<button class="btn btn-ghost btn-sm" id="calNext" type="button">' + t('Bulan Berikutnya') + '</button>' +
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
      '<span><i class="sw-win"></i>' + t('Profit') + '</span>' +
      '<span><i class="sw-loss"></i>' + t('Rugi') + '</span>' +
      '<span><i class="sw-flat"></i>' + t('Impas / belum untung rugi') + '</span>' +
      '<span><i class="sw-none"></i>' + t('Tidak ada trade') + '</span>' +
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
        '<th>' + t('Simbol') + '</th><th>' + t('Arah') + '</th><th>' + t('Hasil') + '</th><th class="num">' + t('PnL') + '</th><th class="num">' + t('R') + '</th>' +
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
    : '<p class="muted" style="margin:0">' + t('Tidak ada trade pada tanggal ini.') + '</p>';

  openModal(
    '<div class="modal modal-md">' +
      '<div class="modal-head"><h2>' + esc(shortDate(day)) + '</h2>' +
      '<button class="btn-icon" data-close type="button">' + t('Tutup') + '</button></div>' +
      '<div class="modal-body">' +
        (trades.length
          ? '<div class="alert ' + (pnl >= 0 ? 'info' : 'danger') + '">' +
            '<strong>' + t('Total hari ini') + '</strong>' +
            '<span class="' + signClass(pnl) + '">' +
            esc(fmtSigned(state.settings.currency, pnl)) + '</span> ' +
            t('dari {n} trade', { n: trades.length }) + '</div>'
          : '') +
        body +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-close type="button">' + t('Tutup') + '</button>' +
        '<button class="btn btn-primary" id="dayAdd" type="button">' + t('Tambah Trade Hari Ini') + '</button>' +
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
    '<div class="field w-sm"><label>' + t('Dari') + '</label>' +
      '<input type="date" id="aFrom" value="' + esc(analyticsFilters.from) + '"></div>' +
    '<div class="field w-sm"><label>' + t('Sampai') + '</label>' +
      '<input type="date" id="aTo" value="' + esc(analyticsFilters.to) + '"></div>' +
    '<div class="field w-sm"><label>' + t('Simbol') + '</label>' +
      selectHtml('aSymbol', allSymbols, analyticsFilters.symbol) + '</div>' +
    '<div class="field w-sm"><label>' + t('Arah') + '</label>' +
      selectHtml('aSide', [
        { value: 'long', label: t('Long') },
        { value: 'short', label: t('Short') }
      ], analyticsFilters.side) + '</div>' +
    '<div class="field w-md"><label>' + t('Setup') + '</label>' +
      selectHtml('aSetup', state.setups.map(function (x) {
        return { value: x.id, label: x.name };
      }), analyticsFilters.setup) + '</div>' +
    '<div class="field w-sm"><label>' + t('Hasil') + '</label>' +
      selectHtml('aResult', [
        { value: 'win', label: t('Win') },
        { value: 'loss', label: t('Loss') },
        { value: 'be', label: t('Breakeven') },
        { value: 'open', label: t('Open') }
      ], analyticsFilters.result) + '</div>' +
    '<div class="field w-sm"><label>' + t('Tag') + '</label>' +
      selectHtml('aTag', allTags, analyticsFilters.tag) + '</div>' +
    '<button class="btn btn-ghost" id="aReset" type="button">' + t('Reset') + '</button>' +
  '</div>' +

  '<div class="grid g-4">' +
    statCard(t('Total PnL'), esc(fmtSigned(cur, s.totalPnl)),
      t('{n} trade selesai', { n: s.closedCount }), signClass(s.totalPnl)) +
    statCard(t('Win rate'), s.winRate.toFixed(1) + '%',
      t('{w} win / {l} loss', { w: s.wins, l: s.losses })) +
    statCard(t('Expectancy'), esc(fmtSigned(cur, s.expectancy)),
      t('Rata-rata {r}R per trade', { r: (s.avgR >= 0 ? '+' : '') + s.avgR.toFixed(2) }),
      signClass(s.expectancy)) +
    statCard(t('Max Drawdown'), esc(fmtMoney(cur, s.maxDrawdown)),
      t('{v}% dari puncak', { v: s.maxDrawdownPct.toFixed(1) }), 'neg') +
  '</div></div>';

  // Grafik utama
  var monthly = Stats.byMonth(closed);
  var rDist = Stats.rDistribution(closed);

  html += '<div class="grid g-2 section">' +
    '<div class="card"><div class="card-head"><h2>' + t('PnL per Bulan') + '</h2></div>' +
      (monthly.length ? Charts.bars({
        labels: monthly.map(function (x) { return monthLabel(x.key); }),
        values: monthly.map(function (x) { return x.pnl; }),
        format: function (v) { return (v > 0 ? '+' : '') + Math.round(v).toLocaleString(numLocale()); },
        colorFn: function (v) { return v >= 0 ? '#22c55e' : '#ef4444'; }
      }) : Charts.empty(t('Belum ada data'))) +
    '</div>' +
    '<div class="card"><div class="card-head"><h2>' + t('Distribusi R Multiple') + '</h2></div>' +
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
    '<div class="card"><div class="card-head"><h2>' + t('PnL per Simbol') + '</h2></div>' +
      Charts.hbars({
        items: bySym.map(function (x) { return { label: x.key, value: x.pnl }; }),
        format: function (v) { return fmtSigned(cur, v); }
      }) + '</div>' +
    '<div class="card"><div class="card-head"><h2>' + t('PnL per Setup') + '</h2></div>' +
      Charts.hbars({
        items: bySet.map(function (x) { return { label: x.key, value: x.pnl }; }),
        format: function (v) { return fmtSigned(cur, v); },
        emptyMsg: t('Belum ada setup terpilih pada trade')
      }) + '</div>' +
    '<div class="card"><div class="card-head"><h2>' + t('PnL per Hari Minggu') + '</h2></div>' +
      Charts.hbars({
        items: byWd.map(function (x) { return { label: x.key, value: x.pnl }; }),
        format: function (v) { return fmtSigned(cur, v); }
      }) + '</div>' +
    '</div>';

  // Tabel detail per simbol
  if (bySym.length) {
    html += '<div class="card section">' +
      '<div class="card-head"><h2>' + t('Detail Performa per Simbol') + '</h2></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>' + t('Simbol') + '</th><th class="num">' + t('Trade') + '</th><th class="num">' + t('Win Rate') + '</th>' +
        '<th class="num">' + t('Risiko') + '</th><th class="num">' + t('PnL') + '</th><th class="num">' + t('Rata-rata R') + '</th>' +
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
    '<div class="card"><div class="card-head"><h2>' + t('PnL per Jam Entry') + '</h2></div>' +
      (byHour.length ? Charts.bars({
        labels: byHour.map(function (x) { return x.key; }),
        values: byHour.map(function (x) { return x.pnl; }),
        format: function (v) { return (v > 0 ? '+' : '') + Math.round(v).toLocaleString(numLocale()); },
        colorFn: function (v) { return v >= 0 ? '#22c55e' : '#ef4444'; },
        height: 190
      }) : Charts.empty(t('Belum ada jam entry tercatat'))) + '</div>' +
    '<div class="card"><div class="card-head"><h2>' + t('PnL per Mood') + '</h2></div>' +
      (byMood.length ? Charts.hbars({
        items: byMood.map(function (x) { return { label: t(x.key), value: x.pnl }; }),
        format: function (v) { return fmtSigned(cur, v); }
      }) : Charts.empty(t('Belum ada mood tercatat'))) + '</div>' +
    '</div>';

  html += '<div class="grid g-2 section">' +
    '<div class="card"><div class="card-head"><h2>' + t('Kualitas Eksekusi vs Hasil') + '</h2></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>' + t('Penilaian') + '</th><th class="num">' + t('Trade') + '</th><th class="num">' + t('Win Rate') + '</th>' +
        '<th class="num">' + t('PnL') + '</th></tr></thead><tbody>' +
        byQuality.map(function (x) {
          return '<tr><td>' + esc(t(x.key)) + '</td>' +
            '<td class="num">' + x.count + '</td>' +
            '<td class="num">' + x.winRate.toFixed(1) + '%</td>' +
            '<td class="num ' + signClass(x.pnl) + '">' +
            esc(fmtSigned(cur, x.pnl)) + '</td></tr>';
        }).join('') +
      '</tbody></table></div></div>' +
    '<div class="card"><div class="card-head"><h2>' + t('Analisis Disiplin') + '</h2></div>' +
      disciplineTable(closed, cur) +
      (byTag.length
        ? '<h3 style="margin-top:16px">' + t('Tag paling sering') + '</h3>' +
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
    '<div class="card-head"><h2>' + t('Pelanggaran Aturan Risk Management') + '</h2>' +
    '<span class="badge ' + (violations.length ? 'rule' : 'win') + '">' +
    t('{n} temuan', { n: violations.length }) + '</span></div>';

  if (!violations.length) {
    html += '<p class="muted" style="margin:0">' + t('Tidak ada pelanggaran aturan tercatat. Pertahankan disiplin.') + '</p>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr>' +
      '<th>' + t('Jenis') + '</th><th>' + t('Keterangan') + '</th></tr></thead><tbody>' +
      violations.slice(0, 40).map(function (v) {
        return '<tr><td><span class="badge rule">' + esc(t(v.type)) + '</span></td>' +
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
    { key: t('Disiplin'), test: function (t) { return t.disciplined; } },
    { key: t('Melanggar rencana'), test: function (t) { return !t.disciplined; } }
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
    '<div class="card-head"><h2>' + t('Daftar Setup Trading') + '</h2>' +
      '<button class="btn btn-primary" id="addSetup" type="button">' + t('Tambah Setup') + '</button></div>' +
    '<p class="muted small" style="margin:0">' + t('Kumpulkan setup yang sudah terbukti, lengkapi dengan syarat entry dan checklist wajib agar eksekusi konsisten.') + '</p>' +
    '</div>';

  if (!state.setups.length) {
    html += '<div class="empty">' +
      '<div class="title">' + t('Belum ada setup') + '</div>' +
      '<div class="desc">' + t('Tulis setup pertama Anda, misalnya Pullback Trend atau Breakout Retest, lengkap dengan aturan entry, exit, dan checklist pre-trade.') + '</div>' +
      '<button class="btn btn-primary" id="addSetupEmpty">' + t('Tambah Setup Pertama') + '</button>' +
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
      (s.entryRules ? '<div class="small"><b>' + t('Syarat entry:') + '</b><br>' +
        esc(s.entryRules).replace(/\n/g, '<br>') + '</div>' : '') +
      (s.exitRules ? '<div class="small"><b>' + t('Aturan exit:') + '</b><br>' +
        esc(s.exitRules).replace(/\n/g, '<br>') + '</div>' : '') +
      (s.checklist && s.checklist.length
        ? '<div class="small"><b>' + t('Checklist ({n}):', { n: s.checklist.length }) + '</b><ul style="margin:4px 0 0;padding-left:18px">' +
          s.checklist.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') +
          '</ul></div>'
        : '') +
      '<div class="meta">' +
        '<span>' + t('Trade') + ' <b>' + own.length + '</b></span>' +
        '<span>' + t('Win rate') + ' <b>' + wr.toFixed(0) + '%</b></span>' +
        '<span>' + t('PnL') + ' <b class="' + signClass(pnl) + '">' +
          esc(fmtSigned(state.settings.currency, pnl)) + '</b></span>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn btn-sm" data-setup-edit="' + esc(s.id) + '" type="button">' + t('Edit') + '</button>' +
        '<button class="btn btn-danger btn-sm" data-setup-del="' + esc(s.id) + '" type="button">' + t('Hapus') + '</button>' +
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
      confirmDialog(t('Hapus setup'),
        t('Hapus setup "{name}"? Trade yang memakai setup ini tetap tersimpan.', { name: s ? s.name : '' }),
        function () {
          SetupStore.remove(state, id);
          refresh();
          toast(t('Setup dihapus'));
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
      box.innerHTML = '<div class="hint">' + t('Belum ada item checklist.') + '</div>';
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
      '<div class="modal-head"><h2>' + (s ? t('Edit Setup') : t('Tambah Setup')) + '</h2>' +
      '<button class="btn-icon" data-close type="button">' + t('Tutup') + '</button></div>' +
      '<div class="modal-body">' +
        '<div class="field"><label>' + t('Nama setup *') + '</label>' +
          '<input type="text" id="sName" placeholder="Pullback Trend" value="' +
          esc(s ? s.name : '') + '"></div>' +
        '<div class="field"><label>' + t('Deskripsi singkat') + '</label>' +
          '<textarea id="sDesc" placeholder="' + t('Kondisi pasar apa yang dicari...') + '">' +
          esc(s ? s.description : '') + '</textarea></div>' +
        '<div class="form-row">' +
          '<div class="field"><label>' + t('Syarat entry (satu baris satu syarat)') + '</label>' +
            '<textarea id="sEntry">' + esc(s ? s.entryRules : '') + '</textarea></div>' +
          '<div class="field"><label>' + t('Aturan exit') + '</label>' +
            '<textarea id="sExit">' + esc(s ? s.exitRules : '') + '</textarea></div>' +
        '</div>' +
        '<div class="field"><label>' + t('Checklist pre-trade') + '</label>' +
          '<div id="setupItems"></div>' +
          '<div class="add-check">' +
            '<input type="text" id="sCheck" placeholder="' + t('Tambah syarat wajib...') + '">' +
            '<button class="btn" id="sAddCheck" type="button">' + t('Tambah') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-close type="button">' + t('Batal') + '</button>' +
        '<button class="btn btn-primary" id="saveSetup" type="button">' + t('Simpan Setup') + '</button>' +
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
    if (!name) { toast(t('Nama setup wajib diisi'), 'err'); $('#sName').focus(); return; }

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
    toast(s ? t('Setup diperbarui') : t('Setup tersimpan'), 'ok');
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
      '<div class="card-head"><h2>' + t('Aturan Risiko') + '</h2></div>' +
      '<div class="field"><label>' + t('Risiko maksimal per trade (%)') + '</label>' +
        '<input type="number" step="0.1" id="rRiskPct" value="' + esc(set.maxRiskPctTrade) + '">' +
        '<div class="hint">' + t('Dari modal awal, saat ini setara {m} per trade.',
          { m: fmtMoney(set.currency, set.initialCapital * set.maxRiskPctTrade / 100) }) +
        '</div></div>' +
      '<div class="field"><label>' + t('Batas rugi harian (%)') + '</label>' +
        '<input type="number" step="0.1" id="rDailyPct" value="' + esc(set.maxDailyLossPct) + '">' +
        '<div class="hint">' + t('Saat ini setara {m} per hari.',
          { m: fmtMoney(set.currency, set.initialCapital * set.maxDailyLossPct / 100) }) +
        '</div></div>' +
      '<div class="field"><label>' + t('Batas rugi beruntun (kali)') + '</label>' +
        '<input type="number" step="1" id="rStreak" value="' + esc(set.maxLossStreak) + '">' +
        '<div class="hint">' + t('Berhenti trading setelah rugi beruntun sebanyak ini.') + '</div></div>' +
      '<button class="btn btn-primary" id="saveRules" type="button">' + t('Simpan Aturan') + '</button>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-head"><h2>' + t('Trading Plan') + '</h2></div>' +
      '<div class="field"><label>' + t('Target / Tujuan') + '</label>' +
        '<textarea id="pGoal" placeholder="' + t('Misal: naik 5% per bulan dengan drawdown maks 10%') + '">' +
        esc(plan.goal) + '</textarea></div>' +
      '<div class="field"><label>' + t('Simbol yang boleh diperdagangkan') + '</label>' +
        '<input type="text" id="pSymbols" placeholder="EURUSD, XAUUSD" value="' +
        esc(plan.allowedSymbols) + '"></div>' +
      '<div class="field"><label>' + t('Jam trading yang diizinkan') + '</label>' +
        '<input type="text" id="pHours" placeholder="08:00 - 11:00 WIB" value="' +
        esc(plan.allowedHours) + '"></div>' +
      '<div class="field"><label>' + t('Aturan dan larangan') + '</label>' +
        '<textarea id="pRules" placeholder="' + t('Satu baris satu aturan') + '">' +
        esc(plan.rules) + '</textarea></div>' +
      '<button class="btn btn-primary" id="savePlan" type="button">' + t('Simpan Plan') + '</button>' +
    '</div>' +
    '</div>';

  // Checklist sesi
  html += '<div class="grid g-2">' +
    '<div class="card">' +
      '<div class="card-head"><h2>' + t('Checklist Sebelum Sesi') + '</h2></div>' +
      '<div class="check-list" id="preList">' + checklistHtml(state.sessionChecklist) + '</div>' +
      '<div class="add-check">' +
        '<input type="text" id="preInput" placeholder="' + t('Tambah item checklist...') + '">' +
        '<button class="btn" id="preAdd" type="button">' + t('Tambah') + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><h2>' + t('Checklist Setelah Sesi') + '</h2></div>' +
      '<div class="check-list" id="postList">' + checklistHtml(state.postChecklist) + '</div>' +
      '<div class="add-check">' +
        '<input type="text" id="postInput" placeholder="' + t('Tambah item checklist...') + '">' +
        '<button class="btn" id="postAdd" type="button">' + t('Tambah') + '</button>' +
      '</div>' +
    '</div>' +
    '</div>';

  // Ringkasan pelanggaran
  var violations = Stats.violations(state);
  html += '<div class="card" style="margin-top:16px">' +
    '<div class="card-head"><h2>' + t('Riwayat Pelanggaran') + '</h2>' +
    '<span class="badge ' + (violations.length ? 'rule' : 'win') + '">' +
    t('{n} temuan', { n: violations.length }) + '</span></div>' +
    (violations.length
      ? '<ul class="small" style="margin:0;padding-left:18px;line-height:1.9">' +
        violations.slice(0, 15).map(function (v) {
          return '<li><b>' + esc(t(v.type)) + ':</b> ' + esc(v.detail) + '</li>';
        }).join('') + '</ul>'
      : '<p class="muted small" style="margin:0">' + t('Belum ada pelanggaran.') + '</p>') +
    '</div>';

  $('#view').innerHTML = html;

  $('#saveRules').addEventListener('click', function () {
    set.maxRiskPctTrade = Math.max(0, Number($('#rRiskPct').value) || 0);
    set.maxDailyLossPct = Math.max(0, Number($('#rDailyPct').value) || 0);
    set.maxLossStreak = Math.max(0, Math.round(Number($('#rStreak').value) || 0));
    refresh();
    toast(t('Aturan risiko disimpan'), 'ok');
  });

  $('#savePlan').addEventListener('click', function () {
    plan.goal = $('#pGoal').value.trim();
    plan.allowedSymbols = $('#pSymbols').value.trim();
    plan.allowedHours = $('#pHours').value.trim();
    plan.rules = $('#pRules').value.trim();
    refresh();
    toast(t('Trading plan disimpan'), 'ok');
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
      '<div class="card-head"><h2>' + t('Profil Modal') + '</h2></div>' +
      '<div class="field"><label>' + t('Modal awal') + '</label>' +
        '<input type="number" step="any" id="setCapital" value="' + esc(set.initialCapital) + '"></div>' +
      '<div class="field"><label>' + t('Simbol mata uang') + '</label>' +
        '<input type="text" id="setCurrency" maxlength="4" value="' + esc(set.currency) + '">' +
        '<div class="hint">' + t('Contoh: $ atau Rp') + '</div></div>' +
      '<button class="btn btn-primary" id="saveSettings" type="button">' + t('Simpan') + '</button>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-head"><h2>' + t('Statistik Data') + '</h2></div>' +
      '<div class="kv">' +
        '<dt>' + t('Total trade') + '</dt><dd>' + state.trades.length + '</dd>' +
        '<dt>' + t('Posisi terbuka') + '</dt><dd>' + openCount + '</dd>' +
        '<dt>' + t('Jumlah setup') + '</dt><dd>' + state.setups.length + '</dd>' +
        '<dt>' + t('Checklist sesi') + '</dt><dd>' + t('{a} sebelum, {b} sesudah',
          { a: state.sessionChecklist.length, b: state.postChecklist.length }) + '</dd>' +
        '<dt>' + t('Perkiraan ukuran data') + '</dt><dd>' + estimateSize() + '</dd>' +
      '</div>' +
      '<p class="muted small" style="margin-top:14px">' + t('Data tersimpan di browser ini saja (localStorage). Gunakan ekspor berkala agar tidak kehilangan catatan bila browser dibersihkan.') + '</p>' +
    '</div>' +
    '</div>';

  html += '<div class="card" style="margin-top:16px" id="accountCard"></div>';

  html += '<div class="card" style="margin-top:16px" id="installCard"></div>';

  html += '<div class="card" style="margin-top:16px">' +
    '<div class="card-head"><h2>' + t('Cadangan dan Pemulihan') + '</h2></div>' +
    '<div class="grid g-3">' +
      '<div>' +
        '<h3>' + t('Ekspor') + '</h3>' +
        '<p class="muted small">' + t('Unduh seluruh data sebagai berkas.') + '</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn" id="expJson" type="button">' + t('Ekspor JSON') + '</button>' +
          '<button class="btn" id="expCsv" type="button">' + t('Ekspor CSV') + '</button>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<h3>' + t('Impor') + '</h3>' +
        '<p class="muted small">' + t('Memuat berkas JSON akan menimpa data saat ini.') + '</p>' +
        '<input type="file" id="impFile" accept="application/json,.json">' +
      '</div>' +
      '<div>' +
        '<h3>' + t('Reset') + '</h3>' +
        '<p class="muted small">' + t('Hapus semua data dan kembali ke kondisi awal.') + '</p>' +
        '<button class="btn btn-danger" id="resetData" type="button">' + t('Hapus Semua Data') + '</button>' +
      '</div>' +
    '</div>' +
    '</div>';

  html += '<div class="card" style="margin-top:16px">' +
    '<div class="card-head"><h2>' + t('Pintasan Keyboard') + '</h2></div>' +
    '<div class="kv">' +
      '<dt>Esc</dt><dd>' + t('Tutup jendela dialog') + '</dd>' +
      '<dt>Tab</dt><dd>' + t('Pindah antar kolom isian') + '</dd>' +
      '<dt>Enter</dt><dd>' + t('Tambah item checklist') + '</dd>' +
    '</div>' +
    '</div>';

  $('#view').innerHTML = html;

  if (typeof Cloud !== 'undefined') {
    $('#accountCard').innerHTML = Cloud.settingsHtml();
    Cloud.bindSettings();
  } else {
    $('#accountCard').style.display = 'none';
  }
  refreshInstallCard();

  $('#saveSettings').addEventListener('click', function () {
    set.initialCapital = Math.max(0, Number($('#setCapital').value) || 0);
    var cur = $('#setCurrency').value.trim();
    set.currency = cur || '$';
    refresh();
    toast(t('Pengaturan disimpan'), 'ok');
  });

  $('#expJson').addEventListener('click', function () {
    DataPort.exportJSON(state);
    toast(t('Berkas JSON diunduh'), 'ok');
  });
  $('#expCsv').addEventListener('click', function () {
    DataPort.exportCSV(state);
    toast(t('Berkas CSV diunduh'), 'ok');
  });

  $('#impFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    DataPort.importJSON(file, function (err, imported) {
      if (err) {
        toast(t('Berkas tidak valid: {m}', { m: err.message }), 'err');
        return;
      }
      confirmDialog(t('Impor data'),
        t('Timpa semua data saat ini dengan isi berkas "{f}"? ({a} trade, {b} setup)',
          { f: file.name, a: imported.trades.length, b: imported.setups.length }),
        function () {
          state = imported;
          refresh();
          toast(t('Data berhasil diimpor'), 'ok');
        },
        t('Impor'));
    });
    this.value = '';
  });

  $('#resetData').addEventListener('click', function () {
    confirmDialog(t('Hapus semua data'),
      t('Seluruh trade, setup, checklist, dan pengaturan akan dihapus permanen. Lanjutkan?'),
      function () {
        state = Storage.reset();
        refresh();
        toast(t('Semua data dihapus'));
      },
      t('Hapus Semua'));
  });
}

function estimateSize() {
  try {
    var raw = JSON.stringify(state);
    var kb = new Blob([raw]).size / 1024;
    return kb < 1024 ? kb.toFixed(1) + ' KB' : (kb / 1024).toFixed(2) + ' MB';
  } catch (e) {
    return t('tidak dapat dihitung');
  }
}

function applyStaticTexts() {
  var navNames = {
    dashboard: t('Dashboard'),
    trades: t('Log Transaksi'),
    calendar: t('Kalender'),
    analytics: t('Analitik'),
    playbook: t('Playbook'),
    risk: t('Risk & Plan'),
    settings: t('Pengaturan')
  };
  $$('#nav a').forEach(function (a) {
    var r = a.getAttribute('data-route');
    if (navNames[r]) a.textContent = navNames[r];
  });
  var sub = $('.brand-sub');
  if (sub) sub.textContent = t('Catatan dan Evaluasi Transaksi');
  $('#quickAdd').textContent = t('Tambah Trade');
  document.title = t('Jurnal Trading');

  var sel = $('#langSel');
  if (sel) {
    sel.innerHTML = Object.keys(LANGS).map(function (l) {
      return '<option value="' + l + '"' +
        (l === getLang() ? ' selected' : '') + '>' + LANGS[l] + '</option>';
    }).join('');
    sel.title = t('Bahasa');
  }
}

/* =========================================================
   INIT
   ========================================================= */

applyStaticTexts();

$('#quickAdd').addEventListener('click', function () { openTradeModal(); });

$('#langSel').addEventListener('change', function () {
  if (this.value !== getLang()) setLang(this.value);
});

/* ---------- PWA: service worker + prompt instalasi ---------- */

var deferredInstall = null;

window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredInstall = e;
  refreshInstallCard();
});

window.addEventListener('appinstalled', function () {
  deferredInstall = null;
  toast(t('Aplikasi terinstal. Buka dari layar utama.'));
  refreshInstallCard();
});

if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' ||
     location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* abaikan */ });
  });
}

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
}

function installCardHtml() {
  var html = '<div class="card-head"><h2>' + t('Install Aplikasi') + '</h2></div>';
  if (isStandalone()) {
    return html + '<p class="muted small" style="margin:0">' +
      t('Aplikasi sudah terinstal dan berjalan mode aplikasi.') + '</p>';
  }
  html += '<p class="muted small" style="margin-top:0">' +
    t('Pasang sebagai aplikasi di layar utama HP agar terbuka fullscreen dan bisa offline.') + '</p>';
  if (deferredInstall) {
    html += '<p class="small" style="margin-top:0">' +
      t('Perangkat ini mendukung instalasi langsung.') + '</p>' +
      '<button class="btn btn-primary" id="installNow" type="button">' +
      t('Install Sekarang') + '</button>';
  } else {
    html += '<p class="muted small" style="margin:0">' + t('Cara manual:') + '<br>' +
      t('Android Chrome: menu titik tiga → Install aplikasi / Add to Home Screen.') + '<br>' +
      t('iPhone Safari: tombol Share → Add to Home Screen.') + '</p>';
  }
  return html;
}

function refreshInstallCard() {
  var el = $('#installCard');
  if (!el) return;
  el.innerHTML = installCardHtml();
  var btn = $('#installNow');
  if (btn && deferredInstall) btn.addEventListener('click', function () {
    btn.disabled = true;
    deferredInstall.prompt();
    deferredInstall.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') deferredInstall = null;
      else {
        btn.disabled = false;
        toast(t('Instalasi dibatalkan.'));
      }
      refreshInstallCard();
    }).catch(function () {
      btn.disabled = false;
      refreshInstallCard();
    });
  });
}

$('#menuBtn').addEventListener('click', function () {
  $('#sidebar').classList.toggle('open');
});

window.addEventListener('hashchange', route);

if (!location.hash) location.hash = '#/dashboard';
if (typeof Cloud !== 'undefined') Cloud.boot(function () { route(); });
else route();
