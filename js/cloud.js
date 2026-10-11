/* =========================================================
   cloud.js - Auth email dan sinkronisasi Supabase
   Mode ganda:
   - Tanpa konfigurasi (config.js kosong): mode lokal saja.
   - Dengan konfigurasi: wajib login, data tersimpan per
     akun di database cloud, localStorage jadi salinan lokal.
   ========================================================= */

var Cloud = {
  client: null,
  user: null,
  localOnly: false,
  syncing: false,
  pushTimer: null,
  pushing: false,
  pushQueued: false,
  lastPush: '',
  lastPushError: ''
};

/* ---------- Status ---------- */

Cloud.libReady = function () {
  return typeof window.supabase !== 'undefined' &&
    window.supabase && typeof window.supabase.createClient === 'function';
};

Cloud.hasConfig = function () {
  return typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL &&
    typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY;
};

Cloud.configured = function () {
  return Cloud.hasConfig() && Cloud.libReady();
};

Cloud.needLogin = function () {
  return Cloud.configured() && !Cloud.user && !Cloud.localOnly;
};

/* ---------- Boot ---------- */

Cloud.boot = function (done) {
  if (!Cloud.configured()) { done(); return; }

  try {
    Cloud.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('Gagal membuat klien Supabase:', e);
    done();
    return;
  }

  Cloud.client.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_IN' && session && session.user) {
      Cloud.user = { id: session.user.id, email: session.user.email || '' };
      Cloud.pullNow(function () { route(); });
    } else if (event === 'SIGNED_OUT') {
      Cloud.user = null;
      if (Cloud.pushTimer) { clearTimeout(Cloud.pushTimer); Cloud.pushTimer = null; }
      Cloud.pushing = false;
      Cloud.pushQueued = false;
      route();
    }
  });

  Cloud.client.auth.getSession().then(function (res) {
    var session = res && res.data ? res.data.session : null;
    if (session && session.user) {
      Cloud.user = { id: session.user.id, email: session.user.email || '' };
      Cloud.pullNow(function () { done(); });
    } else {
      done();
    }
  }).catch(function (err) {
    console.error('Gagal memulihkan sesi:', err);
    done();
  });
};

/* ---------- Auth ---------- */

Cloud.signUp = function (email, password, cb) {
  Cloud.client.auth.signUp({ email: email, password: password })
    .then(function (res) { cb(res.error || null, res.data || null); })
    .catch(function (err) { cb(err, null); });
};

Cloud.signIn = function (email, password, cb) {
  Cloud.client.auth.signInWithPassword({ email: email, password: password })
    .then(function (res) { cb(res.error || null, res.data || null); })
    .catch(function (err) { cb(err, null); });
};

Cloud.signOut = function () {
  if (!Cloud.client) return;
  Cloud.client.auth.signOut();
};

Cloud.resendConfirm = function (email, cb) {
  Cloud.client.auth.resend({ type: 'signup', email: email })
    .then(function (res) { cb(res.error || null); })
    .catch(function (err) { cb(err); });
};

/* ---------- Layar Masuk / Daftar ---------- */

var authMode = 'in';

Cloud.renderAuth = function () {
  $('#pageTitle').textContent = t('Masuk');
  $$('#nav a').forEach(function (a) { a.classList.remove('active'); });

  var html =
    '<div class="auth-page">' +
      '<div class="auth-grid">' +
        '<div class="auth-brand">' +
          '<div class="auth-logo">JT</div>' +
          '<h2>' + t('Jurnal Trading') + '</h2>' +
          '<p>' + t('Catatan dan evaluasi transaksi yang tersinkron di semua perangkat kamu.') + '</p>' +
          '<ul class="auth-feats">' +
            '<li><span class="fdot"></span><div><b>' + t('Dashboard performa') + '</b><span>' + t('Win rate, profit factor, equity curve') + '</span></div></li>' +
            '<li><span class="fdot"></span><div><b>' + t('Kalender dan analitik') + '</b><span>' + t('Heatmap harian dan laporan per setup') + '</span></div></li>' +
            '<li><span class="fdot"></span><div><b>' + t('Playbook dan risk plan') + '</b><span>' + t('Checklist pre-trade dan batas risiko') + '</span></div></li>' +
          '</ul>' +
          '<div class="auth-secure">' + t('Data terisolasi per akun dan diamankan Row Level Security') + '</div>' +
        '</div>' +
        '<div class="auth-form-side">' +
          '<div class="auth-card">' +
            '<h2>' + (authMode === 'in' ? t('Selamat datang kembali') : t('Buat akun baru')) + '</h2>' +
            '<p class="muted small" style="margin-top:0">' +
              (authMode === 'in'
                ? t('Masuk untuk membuka jurnal kamu.')
                : t('Satu akun untuk semua perangkat.')) + '</p>' +
            '<div class="auth-tabs">' +
              '<button class="atab' + (authMode === 'in' ? ' active' : '') + '" id="tabIn" type="button">' + t('Masuk') + '</button>' +
              '<button class="atab' + (authMode === 'up' ? ' active' : '') + '" id="tabUp" type="button">' + t('Daftar') + '</button>' +
            '</div>' +
            '<div id="authErr"></div>' +
            '<div class="field"><label>' + t('Email') + '</label>' +
              '<input type="text" id="authEmail" placeholder="nama@email.com" autocomplete="email"></div>' +
            '<div class="field"><label>' + t('Kata sandi (min. 6 karakter)') + '</label>' +
              '<div class="pass-wrap">' +
                '<input type="password" id="authPass" placeholder="' + t('Kata sandi') + '" autocomplete="current-password">' +
                '<button class="pass-toggle" id="passToggle" type="button" ' +
                  'title="' + t('Tampilkan kata sandi') + '" aria-label="' + t('Tampilkan kata sandi') + '">' +
                  Cloud.eyeSvg(false) +
                '</button>' +
              '</div></div>' +
            '<button class="btn btn-primary btn-lg btn-block" id="authGo" type="button">' +
              (authMode === 'in' ? t('Masuk ke Jurnal') : t('Daftar Akun')) + '</button>' +
            '<div id="authInfo" style="margin-top:12px"></div>' +
            '<div class="auth-alt"><span>' + t('atau') + '</span></div>' +
            '<button class="btn btn-ghost btn-block" id="authLocal" type="button">' + t('Lanjut tanpa akun (mode lokal)') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  $('#view').innerHTML = html;
  renderSidebarSummary();

  var showErr = function (msg) {
    $('#authErr').innerHTML = '<div class="alert danger" style="margin-bottom:12px">' +
      esc(msg) + '</div>';
  };

  $('#tabIn').addEventListener('click', function () { authMode = 'in'; Cloud.renderAuth(); });
  $('#tabUp').addEventListener('click', function () { authMode = 'up'; Cloud.renderAuth(); });

  var submit = function () {
    $('#authErr').innerHTML = '';
    $('#authInfo').innerHTML = '';
    var email = $('#authEmail').value.trim();
    var pass = $('#authPass').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr(t('Alamat email tidak valid.')); return; }
    if (!pass || pass.length < 6) { showErr(t('Kata sandi minimal 6 karakter.')); return; }

    var btn = $('#authGo');
    btn.disabled = true;
    btn.textContent = t('Memproses...');

    if (authMode === 'in') {
      Cloud.signIn(email, pass, function (err) {
        btn.disabled = false;
        if (err) {
          btn.textContent = t('Masuk');
          showErr(Cloud.friendlyError(err));
          return;
        }
        // SIGNED_IN handler menarik data lalu route().
      });
    } else {
      Cloud.signUp(email, pass, function (err, data) {
        btn.disabled = false;
        btn.textContent = t('Daftar Akun');
        if (err) { showErr(Cloud.friendlyError(err)); return; }
        if (data && data.session) {
          // Konfirmasi email nonaktif: langsung masuk, handler menarik data.
          return;
        }
        $('#authInfo').innerHTML = '<div class="alert info"><strong>' + t('Akun dibuat.') + '</strong>' +
          t('Cek kotak masuk email untuk verifikasi, lalu masuk.') + ' ' +
          '<a href="#" id="authResend">' + t('Kirim ulang email.') + '</a></div>';
        var rs = $('#authResend');
        if (rs) rs.addEventListener('click', function (e) {
          e.preventDefault();
          Cloud.resendConfirm(email, function (rerr) {
            toast(rerr ? Cloud.friendlyError(rerr) : t('Email verifikasi dikirim ulang'), rerr ? 'err' : 'ok');
          });
        });
      });
    }
  };

  $('#authGo').addEventListener('click', submit);
  $('#authPass').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  $('#passToggle').addEventListener('click', function () {
    var input = $('#authPass');
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    this.innerHTML = Cloud.eyeSvg(show);
    var label = show ? t('Sembunyikan kata sandi') : t('Tampilkan kata sandi');
    this.title = label;
    this.setAttribute('aria-label', label);
    input.focus();
  });

  $('#authLocal').addEventListener('click', function (e) {
    e.preventDefault();
    Cloud.localOnly = true;
    if (!location.hash || location.hash === '#/dashboard') route();
    else location.hash = '#/dashboard';
  });
};

Cloud.eyeSvg = function (open) {
  var body = open
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
      '<circle cx="12" cy="12" r="3"/>'
    : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 ' +
      '18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 ' +
      '8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>' +
      '<line x1="1" y1="1" x2="23" y2="23"/>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
};

Cloud.friendlyError = function (err) {
  var msg = (err && err.message) ? err.message : String(err || t('Terjadi kesalahan'));
  if (/invalid login credentials/i.test(msg)) return t('Email atau kata sandi salah.');
  if (/user already registered/i.test(msg)) return t('Email ini sudah terdaftar. Silakan masuk.');
  if (/email not confirmed/i.test(msg)) return t('Email belum diverifikasi. Cek kotak masuk kamu.');
  if (/rate limit/i.test(msg)) return t('Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.');
  if (/password/i.test(msg) && /short|length|6/i.test(msg)) return t('Kata sandi minimal 6 karakter.');
  if (/network|fetch|failed/i.test(msg)) return t('Tidak bisa menghubungi server. Periksa koneksi internet.');
  return msg;
};

/* ---------- Kotak akun di sidebar ---------- */

Cloud.accountHtml = function () {
  if (!Cloud.configured()) {
    return '<div class="row"><span>' + t('Mode') + '</span><b>' + t('Lokal') + '</b></div>';
  }
  if (Cloud.user) {
    return '<div class="row"><span>' + t('Akun') + '</span><b style="overflow:hidden;text-overflow:ellipsis;max-width:130px">' +
      esc(Cloud.user.email) + '</b></div>' +
      '<div class="row"><span>' + t('Status') + '</span><b class="pos">' + t('Tersinkron') + '</b></div>';
  }
  if (Cloud.localOnly) {
    return '<div class="row"><span>' + t('Mode') + '</span><b>' + t('Lokal') + '</b></div>';
  }
  return '<div class="row"><span>' + t('Akun') + '</span><b>' + t('Belum masuk') + '</b></div>';
};

/* ---------- Kartu akun di Pengaturan ---------- */

Cloud.settingsHtml = function () {
  var html = '<div class="card-head"><h2>' + t('Akun dan Sinkronisasi') + '</h2></div>';

  if (!Cloud.hasConfig()) {
    return html +
      '<p class="muted small" style="margin-top:0">' +
      t('Mode lokal: data hanya tersimpan di browser ini. Untuk login email dan sinkron antar perangkat, isi {a} dengan URL dan anon key Supabase, lalu jalankan {b} di SQL Editor. Panduan ada di README.',
        { a: 'js/config.js', b: 'supabase/schema.sql' }) + '</p>';
  }
  if (!Cloud.libReady()) {
    return html +
      '<div class="alert warn"><strong>' + t('Pustaka Supabase tidak termuat.') + '</strong>' +
      t('Periksa koneksi internet lalu muat ulang halaman.') + '</div>';
  }
  if (!Cloud.user) {
    return html +
      '<p class="muted small" style="margin-top:0">' +
      t('Kamu belum masuk. Data yang tampil adalah salinan lokal di browser ini.') + '</p>' +
      '<button class="btn btn-primary" id="goLogin" type="button">' + t('Masuk / Daftar') + '</button>';
  }

  return html +
    '<div class="kv">' +
      '<dt>' + t('Email') + '</dt><dd>' + esc(Cloud.user.email) + '</dd>' +
      '<dt>' + t('Status') + '</dt><dd class="pos">' + t('Tersinkron ke cloud') + '</dd>' +
      '<dt>' + t('Sinkron terakhir') + '</dt><dd>' + esc(Cloud.lastPush || t('belum pernah')) +
        (Cloud.lastPushError ? ' <span class="neg">(' + esc(Cloud.lastPushError) + ')</span>' : '') +
      '</dd>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
      '<button class="btn" id="pushNow" type="button">' + t('Sinkron Sekarang') + '</button>' +
      '<button class="btn" id="pullNow" type="button">' + t('Muat Ulang dari Cloud') + '</button>' +
      '<button class="btn btn-ghost" id="logOut" type="button">' + t('Keluar') + '</button>' +
    '</div>' +
    '<p class="muted small" style="margin:12px 0 0">' +
    t('Perubahan tersimpan otomatis ke cloud beberapa detik setelah kamu mengedit.') + '</p>';
};

Cloud.bindSettings = function () {
  var go = $('#goLogin');
  if (go) go.addEventListener('click', function () {
    Cloud.localOnly = false;
    location.hash = '#/dashboard';
    route();
  });

  var push = $('#pushNow');
  if (push) push.addEventListener('click', function () {
    push.disabled = true;
    Cloud.pushNow(function (err) {
      push.disabled = false;
      toast(err ? t('Gagal sinkron: {m}', { m: err }) : t('Sinkron ke cloud selesai'), err ? 'err' : 'ok');
      renderSettings();
      renderSidebarSummary();
    });
  });

  var pull = $('#pullNow');
  if (pull) pull.addEventListener('click', function () {
    confirmDialog(t('Muat ulang dari cloud'),
      t('Data lokal akan diganti dengan data dari cloud. Perubahan lokal yang belum tersinkron akan hilang. Lanjutkan?'),
      function () {
        Cloud.pullNow(function (err) {
          if (err) { toast(t('Gagal memuat: {m}', { m: err }), 'err'); return; }
          refresh();
          toast(t('Data dimuat dari cloud'), 'ok');
        });
      }, t('Muat Ulang'));
  });

  var out = $('#logOut');
  if (out) out.addEventListener('click', function () {
    confirmDialog(t('Keluar akun'),
      t('Kamu akan keluar. Salinan lokal terakhir tetap tampil di browser ini.'),
      function () { Cloud.signOut(); }, t('Keluar'));
  });
};

/* ---------- Pemetaan baris <-> state ---------- */

Cloud.tradeToRow = function (t, userId) {
  return {
    id: t.id, user_id: userId,
    symbol: t.symbol, market: t.market, side: t.side,
    status: t.status, result: t.result,
    entry_date: t.entryDate, exit_date: t.exitDate,
    entry_price: t.entryPrice, exit_price: t.exitPrice,
    sl: t.sl, tp: t.tp, lot: t.lot, pips: t.pips,
    risk: t.risk, pnl: t.pnl, r_multiple: t.rMultiple,
    setup_id: t.setupId, tags: t.tags || [],
    quality: t.quality, mood: t.mood,
    disciplined: !!t.disciplined, notes: t.notes,
    screenshot_url: (t.screenshot || '').indexOf('data:') === 0 ? '' : (t.screenshot || ''),
    created_at: t.createdAt || new Date().toISOString()
  };
};

Cloud.rowToTrade = function (r) {
  return normalizeTrade({
    id: r.id, symbol: r.symbol, market: r.market, side: r.side,
    status: r.status, entryDate: r.entry_date || '', exitDate: r.exit_date || '',
    entryPrice: r.entry_price, exitPrice: r.exit_price,
    sl: r.sl, tp: r.tp, lot: r.lot, pips: r.pips,
    risk: r.risk, pnl: r.pnl, setupId: r.setup_id || '',
    tags: r.tags || [], quality: r.quality, mood: r.mood || '',
    disciplined: !!r.disciplined, notes: r.notes || '',
    screenshot: r.screenshot_url || '',
    createdAt: r.created_at || new Date().toISOString()
  });
};

Cloud.setupToRow = function (s, userId) {
  return {
    id: s.id, user_id: userId, name: s.name,
    description: s.description || '', entry_rules: s.entryRules || '',
    exit_rules: s.exitRules || '', checklist: s.checklist || [],
    created_at: s.createdAt || new Date().toISOString()
  };
};

Cloud.rowToSetup = function (r) {
  return {
    id: r.id, name: r.name || '', description: r.description || '',
    entryRules: r.entry_rules || '', exitRules: r.exit_rules || '',
    checklist: Array.isArray(r.checklist) ? r.checklist : [],
    createdAt: r.created_at || new Date().toISOString()
  };
};

Cloud.profileToRow = function (userId) {
  return {
    user_id: userId,
    currency: state.settings.currency,
    initial_capital: state.settings.initialCapital,
    max_risk_pct_trade: state.settings.maxRiskPctTrade,
    max_daily_loss_pct: state.settings.maxDailyLossPct,
    max_loss_streak: state.settings.maxLossStreak,
    plan_goal: state.plan.goal || '',
    plan_allowed_symbols: state.plan.allowedSymbols || '',
    plan_allowed_hours: state.plan.allowedHours || '',
    plan_rules: state.plan.rules || '',
    updated_at: new Date().toISOString()
  };
};

Cloud.applyProfile = function (target, r) {
  if (!r) return;
  target.settings.currency = r.currency || '$';
  target.settings.initialCapital = Number(r.initial_capital) || 0;
  target.settings.maxRiskPctTrade = Number(r.max_risk_pct_trade) || 0;
  target.settings.maxDailyLossPct = Number(r.max_daily_loss_pct) || 0;
  target.settings.maxLossStreak = Math.round(Number(r.max_loss_streak) || 0);
  target.plan.goal = r.plan_goal || '';
  target.plan.allowedSymbols = r.plan_allowed_symbols || '';
  target.plan.allowedHours = r.plan_allowed_hours || '';
  target.plan.rules = r.plan_rules || '';
};

/* ---------- Tarik (cloud -> lokal) ---------- */

Cloud.pullNow = function (cb) {
  if (!Cloud.user) { cb(t('belum masuk')); return; }
  Cloud.syncing = true;
  var c = Cloud.client;
  var uid = Cloud.user.id;

  Promise.all([
    c.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
    c.from('setups').select('*').eq('user_id', uid),
    c.from('trades').select('*').eq('user_id', uid),
    c.from('checklist_items').select('*').eq('user_id', uid).order('position')
  ]).then(function (results) {
    var err = null;
    results.forEach(function (r) { if (r.error && !err) err = r.error; });
    if (err) throw err;

    var fresh = clone(DEFAULT_STATE);
    if (results[0].data) Cloud.applyProfile(fresh, results[0].data);
    fresh.setups = (results[1].data || []).map(Cloud.rowToSetup);
    fresh.trades = (results[2].data || []).map(Cloud.rowToTrade);

    var pres = [], posts = [];
    (results[3].data || []).forEach(function (r) {
      var item = { id: r.id, text: r.item_text || '', done: !!r.done };
      if (r.kind === 'post') posts.push(item); else pres.push(item);
    });
    if (pres.length) fresh.sessionChecklist = pres;
    if (posts.length) fresh.postChecklist = posts;

    state = Storage.migrate(fresh);
    Storage.save(state);
    Cloud.syncing = false;
    cb(null);
  }).catch(function (e) {
    Cloud.syncing = false;
    console.error('Pull gagal:', e);
    cb((e && e.message) || t('gagal memuat'));
  });
};

/* ---------- Dorong (lokal -> cloud, debounce) ---------- */

Cloud.schedulePush = function () {
  if (!Cloud.configured() || !Cloud.user || Cloud.syncing) return;
  if (Cloud.pushTimer) clearTimeout(Cloud.pushTimer);
  Cloud.pushTimer = setTimeout(function () {
    Cloud.pushTimer = null;
    if (!Cloud.user || Cloud.syncing) return;
    Cloud.pushNow();
  }, 2000);
};

Cloud.pushNow = function (cb) {
  cb = cb || function () {};
  if (!Cloud.user) { cb(t('belum masuk')); return; }
  if (Cloud.pushing) { Cloud.pushQueued = true; cb(null); return; }
  Cloud.pushing = true;

  var done = function (err) {
    Cloud.pushing = false;
    if (err) {
      Cloud.lastPushError = err;
      console.error('Push gagal:', err);
      cb(err);
    } else {
      Cloud.lastPushError = '';
      Cloud.lastPush = new Date().toLocaleString('id-ID');
      cb(null);
    }
    if (Cloud.pushQueued) {
      Cloud.pushQueued = false;
      Cloud.pushNow(function () {});
    }
  };

  Cloud.uploadPendingShots()
    .then(function () { return Cloud.upsertAll(); })
    .then(function () { done(null); })
    .catch(function (e) { done((e && e.message) || t('gagal sinkron')); });
};

/* Unggah screenshot yang masih berupa data URL ke Storage,
   lalu ganti dengan URL publik di state dan salinan lokal. */

Cloud.uploadPendingShots = function () {
  var pending = state.trades.filter(function (t) {
    return t.screenshot && t.screenshot.indexOf('data:') === 0;
  });
  if (!pending.length) return Promise.resolve();

  var chain = Promise.resolve();
  pending.forEach(function (t) {
    chain = chain.then(function () {
      return Cloud.uploadShot(t.screenshot, t.id).then(function (url) {
        if (url) {
          t.screenshot = url;
          Storage.save(state);
        }
      });
    });
  });
  return chain;
};

Cloud.uploadShot = function (dataUrl, tradeId) {
  var blob = Cloud.dataUrlToBlob(dataUrl);
  if (!blob) return Promise.resolve(null);
  var path = Cloud.user.id + '/' + tradeId + '.jpg';

  return Cloud.client.storage.from('screenshots')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
    .then(function (res) {
      if (res.error) throw res.error;
      var pub = Cloud.client.storage.from('screenshots').getPublicUrl(path);
      return pub && pub.data ? pub.data.publicUrl : null;
    })
    .catch(function (e) {
      console.error('Unggah screenshot gagal:', e);
      return null;
    });
};

Cloud.dataUrlToBlob = function (dataUrl) {
  try {
    var parts = dataUrl.split(',');
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch (e) {
    return null;
  }
};

Cloud.upsertAll = function () {
  var c = Cloud.client;
  var uid = Cloud.user.id;

  var setupRows = state.setups.map(function (s) { return Cloud.setupToRow(s, uid); });
  var tradeRows = state.trades.map(function (t) { return Cloud.tradeToRow(t, uid); });

  var checkRows = [];
  state.sessionChecklist.forEach(function (item, i) {
    checkRows.push({ id: item.id, user_id: uid, kind: 'pre',
      item_text: item.text, done: !!item.done, position: i });
  });
  state.postChecklist.forEach(function (item, i) {
    checkRows.push({ id: item.id, user_id: uid, kind: 'post',
      item_text: item.text, done: !!item.done, position: i });
  });

  return c.from('profiles').upsert(Cloud.profileToRow(uid)).then(function (r) {
    if (r.error) throw r.error;
    return c.from('setups').upsert(setupRows);
  }).then(function (r) {
    if (r.error) throw r.error;
    return c.from('trades').select('id').eq('user_id', uid);
  }).then(function (r) {
    if (r.error) throw r.error;
    var keep = {};
    tradeRows.forEach(function (t) { keep[t.id] = true; });
    var gone = (r.data || []).map(function (x) { return x.id; })
      .filter(function (id) { return !keep[id]; });
    var chain = Promise.resolve();
    if (gone.length) {
      chain = chain.then(function () {
        return c.from('trades').delete().in('id', gone).then(function (d) {
          if (d.error) throw d.error;
        });
      });
    }
    return chain.then(function () { return c.from('trades').upsert(tradeRows); });
  }).then(function (r) {
    if (r.error) throw r.error;
    return c.from('setups').select('id').eq('user_id', uid);
  }).then(function (r) {
    if (r.error) throw r.error;
    var keep = {};
    setupRows.forEach(function (s) { keep[s.id] = true; });
    var gone = (r.data || []).map(function (x) { return x.id; })
      .filter(function (id) { return !keep[id]; });
    if (!gone.length) return null;
    return c.from('setups').delete().in('id', gone).then(function (d) {
      if (d.error) throw d.error;
    });
  }).then(function () {
    return c.from('checklist_items').delete().eq('user_id', uid);
  }).then(function (r) {
    if (r.error) throw r.error;
    if (!checkRows.length) return null;
    return c.from('checklist_items').insert(checkRows);
  }).then(function (r) {
    if (r && r.error) throw r.error;
  });
};
