/* =========================================================
   storage.js - Model data dan penyimpanan localStorage
   ========================================================= */

var STORAGE_KEY = 'jurnal_trading_v1';

var MARKETS = ['Forex', 'Crypto', 'Saham', 'Indeks', 'Komoditas', 'Lainnya'];

var MOODS = ['Tenang', 'Fokus', 'Ragu', 'Takut', 'Serakah', 'Marah', 'FOMO'];

var DEFAULT_STATE = {
  settings: {
    initialCapital: 10000,
    currency: '$',
    maxRiskPctTrade: 1,
    maxDailyLossPct: 3,
    maxLossStreak: 3
  },
  plan: {
    goal: '',
    allowedSymbols: '',
    allowedHours: '',
    rules: ''
  },
  sessionChecklist: [
    { id: 'c1', text: 'Cek kalender ekonomi dan berita penting', done: false },
    { id: 'c2', text: 'Tentukan level kunci harian sebelum buka chart', done: false },
    { id: 'c3', text: 'Tetapkan batas risiko dan target hari ini', done: false },
    { id: 'c4', text: 'Pastikan kondisi fisik dan mental prima', done: false }
  ],
  postChecklist: [
    { id: 'p1', text: 'Catat semua trade yang dieksekusi hari ini', done: false },
    { id: 'p2', text: 'Tandai trade yang melanggar trading plan', done: false },
    { id: 'p3', text: 'Tulis satu pelajaran dari sesi hari ini', done: false },
    { id: 'p4', text: 'Reset mindset untuk sesi berikutnya', done: false }
  ],
  setups: [],
  trades: []
};

/* ---------- Util ---------- */

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 7);
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ---------- Storage ---------- */

var Storage = {
  load: function () {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }

    if (!raw) return clone(DEFAULT_STATE);

    try {
      var parsed = JSON.parse(raw);
      return Storage.migrate(parsed);
    } catch (e) {
      console.error('Gagal membaca data tersimpan:', e);
      return clone(DEFAULT_STATE);
    }
  },

  save: function (state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Gagal menyimpan:', e);
      return false;
    }
  },

  migrate: function (data) {
    var base = clone(DEFAULT_STATE);
    if (!data || typeof data !== 'object') return base;

    base.settings = Object.assign(base.settings, data.settings || {});
    base.plan = Object.assign(base.plan, data.plan || {});
    base.setups = Array.isArray(data.setups) ? data.setups : [];
    base.trades = Array.isArray(data.trades) ? data.trades : [];
    base.sessionChecklist = Array.isArray(data.sessionChecklist) && data.sessionChecklist.length
      ? data.sessionChecklist : base.sessionChecklist;
    base.postChecklist = Array.isArray(data.postChecklist) && data.postChecklist.length
      ? data.postChecklist : base.postChecklist;

    return base;
  },

  reset: function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* abaikan */ }
    return clone(DEFAULT_STATE);
  }
};

/* ---------- Normalisasi trade ---------- */

function normalizeTrade(t) {
  var risk = num(t.risk, 0);
  var pnl = num(t.pnl, 0);
  var status = t.status === 'open' ? 'open' : 'closed';

  var result = 'be';
  if (status === 'open') result = 'open';
  else if (pnl > 0) result = 'win';
  else if (pnl < 0) result = 'loss';

  return {
    id: t.id || uid('tr'),
    symbol: (t.symbol || '').toUpperCase().trim(),
    market: t.market || 'Forex',
    side: t.side === 'short' ? 'short' : 'long',
    status: status,
    result: result,
    entryDate: t.entryDate || '',
    exitDate: t.exitDate || '',
    entryPrice: num(t.entryPrice, 0),
    exitPrice: num(t.exitPrice, 0),
    sl: num(t.sl, 0),
    tp: num(t.tp, 0),
    lot: num(t.lot, 0),
    pips: num(t.pips, 0),
    risk: risk,
    pnl: pnl,
    rMultiple: risk !== 0 ? pnl / risk : 0,
    setupId: t.setupId || '',
    tags: Array.isArray(t.tags) ? t.tags : [],
    quality: num(t.quality, 0),
    mood: t.mood || '',
    disciplined: !!t.disciplined,
    notes: t.notes || '',
    screenshot: t.screenshot || '',
    createdAt: t.createdAt || new Date().toISOString()
  };
}

function num(v, fallback) {
  if (v === '' || v === null || typeof v === 'undefined') return fallback || 0;
  var n = Number(v);
  return isFinite(n) ? n : (fallback || 0);
}

/* ---------- CRUD Trade ---------- */

var TradeStore = {
  all: function (state) { return state.trades; },

  get: function (state, id) {
    for (var i = 0; i < state.trades.length; i++) {
      if (state.trades[i].id === id) return state.trades[i];
    }
    return null;
  },

  add: function (state, data) {
    var trade = normalizeTrade(data);
    state.trades.push(trade);
    return trade;
  },

  update: function (state, id, data) {
    var idx = -1;
    for (var i = 0; i < state.trades.length; i++) {
      if (state.trades[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return null;
    data.id = id;
    data.createdAt = state.trades[idx].createdAt;
    var updated = normalizeTrade(data);
    state.trades[idx] = updated;
    return updated;
  },

  remove: function (state, id) {
    state.trades = state.trades.filter(function (t) { return t.id !== id; });
  }
};

/* ---------- CRUD Setup ---------- */

var SetupStore = {
  get: function (state, id) {
    for (var i = 0; i < state.setups.length; i++) {
      if (state.setups[i].id === id) return state.setups[i];
    }
    return null;
  },

  add: function (state, data) {
    var setup = {
      id: uid('st'),
      name: (data.name || '').trim(),
      description: data.description || '',
      entryRules: data.entryRules || '',
      exitRules: data.exitRules || '',
      checklist: Array.isArray(data.checklist) ? data.checklist : [],
      createdAt: new Date().toISOString()
    };
    state.setups.push(setup);
    return setup;
  },

  update: function (state, id, data) {
    var setup = SetupStore.get(state, id);
    if (!setup) return null;
    setup.name = (data.name || '').trim();
    setup.description = data.description || '';
    setup.entryRules = data.entryRules || '';
    setup.exitRules = data.exitRules || '';
    if (Array.isArray(data.checklist)) setup.checklist = data.checklist;
    return setup;
  },

  remove: function (state, id) {
    state.setups = state.setups.filter(function (s) { return s.id !== id; });
  }
};

/* ---------- Export / Import ---------- */

var DataPort = {
  download: function (filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  },

  exportJSON: function (state) {
    var stamp = new Date().toISOString().slice(0, 10);
    DataPort.download('jurnal-trading-' + stamp + '.json',
      JSON.stringify(state, null, 2));
  },

  exportCSV: function (state) {
    var headers = [
      'Tanggal Entry', 'Tanggal Exit', 'Simbol', 'Pasar', 'Arah', 'Status',
      'Hasil', 'Entry', 'Exit', 'SL', 'TP', 'Lot', 'Pips',
      'Risiko', 'PnL', 'R Multiple', 'Setup', 'Tags',
      'Kualitas', 'Mood', 'Disiplin', 'Catatan'
    ];

    var setupName = function (id) {
      var s = SetupStore.get(state, id);
      return s ? s.name : '';
    };

    var rows = state.trades.map(function (t) {
      return [
        t.entryDate, t.exitDate, t.symbol, t.market,
        t.side === 'long' ? 'Long' : 'Short',
        t.status === 'open' ? 'Terbuka' : 'Selesai',
        t.result === 'win' ? 'Win' : t.result === 'loss' ? 'Loss' :
          t.result === 'open' ? 'Open' : 'Breakeven',
        t.entryPrice, t.exitPrice, t.sl, t.tp, t.lot, t.pips,
        t.risk, t.pnl, t.rMultiple.toFixed(2),
        setupName(t.setupId), t.tags.join(' | '),
        t.quality, t.mood, t.disciplined ? 'Ya' : 'Tidak', t.notes
      ];
    });

    var csv = [headers].concat(rows).map(function (row) {
      return row.map(function (cell) {
        var s = String(cell == null ? '' : cell);
        if (/[";\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(';');
    }).join('\r\n');

    var stamp = new Date().toISOString().slice(0, 10);
    DataPort.download('jurnal-trading-' + stamp + '.csv',
      '\ufeff' + csv, 'text/csv;charset=utf-8');
  },

  importJSON: function (file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = JSON.parse(e.target.result);
        var state = Storage.migrate(parsed);
        callback(null, state);
      } catch (err) {
        callback(err, null);
      }
    };
    reader.onerror = function () {
      callback(new Error('File tidak bisa dibaca'), null);
    };
    reader.readAsText(file);
  }
};
