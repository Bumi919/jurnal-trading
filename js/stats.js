/* =========================================================
   stats.js - Perhitungan statistik jurnal trading
   ========================================================= */

var Stats = {

  closed: function (trades) {
    return trades.filter(function (t) { return t.status === 'closed'; });
  },

  open: function (trades) {
    return trades.filter(function (t) { return t.status === 'open'; });
  },

  sortClosed: function (trades) {
    return Stats.closed(trades).slice().sort(function (a, b) {
      var da = a.exitDate || a.entryDate || '';
      var db = b.exitDate || b.entryDate || '';
      if (da === db) return (a.createdAt || '').localeCompare(b.createdAt || '');
      return da.localeCompare(db);
    });
  },

  /* ---------- Ringkasan utama ---------- */

  summary: function (state) {
    var trades = state.trades || [];
    var closed = Stats.closed(trades);
    var open = Stats.open(trades);

    var wins = 0, losses = 0, bes = 0;
    var grossWin = 0, grossLoss = 0;
    var totalPnl = 0, totalRisk = 0, rSum = 0;

    closed.forEach(function (t) {
      totalPnl += t.pnl;
      totalRisk += t.risk;
      rSum += t.rMultiple;
      if (t.result === 'win') { wins++; grossWin += t.pnl; }
      else if (t.result === 'loss') { losses++; grossLoss += t.pnl; }
      else { bes++; }
    });

    var settled = wins + losses;
    var winRate = settled > 0 ? (wins / settled) * 100 : 0;
    var profitFactor = grossLoss !== 0 ? grossWin / Math.abs(grossLoss)
      : (grossWin > 0 ? Infinity : 0);

    var avgWin = wins > 0 ? grossWin / wins : 0;
    var avgLoss = losses > 0 ? grossLoss / losses : 0;
    var avgR = closed.length > 0 ? rSum / closed.length : 0;

    // Expectancy per trade: (winRate * avgWin) + ((1-winRate) * avgLoss)
    var wr = settled > 0 ? wins / settled : 0;
    var expectancy = settled > 0 ? (wr * avgWin) + ((1 - wr) * avgLoss) : 0;

    var equity = Stats.equityCurve(state);
    var dd = Stats.drawdown(equity);
    var streaks = Stats.streaks(closed);

    var capital = state.settings.initialCapital + totalPnl;
    var roi = state.settings.initialCapital !== 0
      ? (totalPnl / state.settings.initialCapital) * 100 : 0;

    return {
      totalTrades: trades.length,
      closedCount: closed.length,
      openCount: open.length,
      wins: wins,
      losses: losses,
      breakevens: bes,
      winRate: winRate,
      profitFactor: profitFactor,
      grossWin: grossWin,
      grossLoss: grossLoss,
      totalPnl: totalPnl,
      totalRisk: totalRisk,
      avgWin: avgWin,
      avgLoss: avgLoss,
      avgR: avgR,
      avgPerTrade: closed.length > 0 ? totalPnl / closed.length : 0,
      expectancy: expectancy,
      maxDrawdown: dd.amount,
      maxDrawdownPct: dd.pct,
      currentStreak: streaks.current,
      bestWinStreak: streaks.bestWin,
      worstLossStreak: streaks.bestLoss,
      equity: equity,
      capitalNow: capital,
      roi: roi
    };
  },

  /* ---------- Equity curve ---------- */

  equityCurve: function (state) {
    var closed = Stats.sortClosed(state.trades);
    var points = [];
    var value = state.settings.initialCapital;

    points.push({ date: '', value: value, label: t('Modal awal') });

    closed.forEach(function (t) {
      value += t.pnl;
      points.push({
        date: (t.exitDate || t.entryDate || '').slice(0, 10),
        value: value,
        label: t.symbol + ' ' + fmtSigned(state.settings.currency, t.pnl)
      });
    });

    return points;
  },

  drawdown: function (equity) {
    var peak = -Infinity;
    var maxAmount = 0;
    var maxPct = 0;

    equity.forEach(function (p) {
      if (p.value > peak) peak = p.value;
      var drop = peak - p.value;
      if (drop > maxAmount) maxAmount = drop;
      if (peak > 0) {
        var pct = (drop / peak) * 100;
        if (pct > maxPct) maxPct = pct;
      }
    });

    return { amount: maxAmount, pct: maxPct };
  },

  streaks: function (closedSorted) {
    var current = { type: 'none', count: 0 };
    var bestWin = 0, bestLoss = 0;
    var run = { type: null, count: 0 };

    function closeRun() {
      if (run.type === 'win' && run.count > bestWin) bestWin = run.count;
      if (run.type === 'loss' && run.count > bestLoss) bestLoss = run.count;
    }

    closedSorted.forEach(function (t) {
      var type = t.result === 'win' ? 'win' : t.result === 'loss' ? 'loss' : 'none';
      if (type === 'none') {
        closeRun();
        run = { type: null, count: 0 };
        return;
      }
      if (run.type === type) run.count++;
      else {
        closeRun();
        run = { type: type, count: 1 };
      }
    });
    closeRun();

    current.type = run.type || 'none';
    current.count = run.count || 0;

    return { current: current, bestWin: bestWin, bestLoss: bestLoss };
  },

  /* ---------- PnL per hari (untuk kalender) ---------- */

  dailyMap: function (trades) {
    var map = {};
    (trades || []).forEach(function (t) {
      var key = (t.status === 'open' ? t.entryDate : (t.exitDate || t.entryDate) || '')
        .slice(0, 10);
      if (!key) return;
      if (!map[key]) map[key] = { pnl: 0, count: 0, trades: [] };
      if (t.status === 'closed') map[key].pnl += t.pnl;
      map[key].count++;
      map[key].trades.push(t);
    });
    return map;
  },

  /* ---------- Pengelompokan ---------- */

  groupBy: function (trades, keyFn) {
    var groups = {};
    trades.forEach(function (t) {
      var key = keyFn(t);
      if (!key) return;
      if (!groups[key]) {
        groups[key] = { key: key, count: 0, wins: 0, losses: 0, pnl: 0, r: 0, risk: 0 };
      }
      var g = groups[key];
      g.count++;
      g.pnl += t.pnl;
      g.r += t.rMultiple;
      g.risk += t.risk;
      if (t.result === 'win') g.wins++;
      if (t.result === 'loss') g.losses++;
    });

    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      var settled = g.wins + g.losses;
      g.winRate = settled > 0 ? (g.wins / settled) * 100 : 0;
      g.avgR = g.count > 0 ? g.r / g.count : 0;
      return g;
    }).sort(function (a, b) { return b.pnl - a.pnl; });
  },

  bySymbol: function (trades) {
    return Stats.groupBy(trades, function (tr) { return tr.symbol || t('TANPA'); });
  },

  bySetup: function (trades, state) {
    var nameOf = function (id) {
      var s = SetupStore.get(state, id);
      return s ? s.name : (id ? t('Terhapus') : '');
    };
    return Stats.groupBy(trades, function (t) { return nameOf(t.setupId); });
  },

  bySide: function (trades) {
    return Stats.groupBy(trades, function (t) {
      return t.side === 'long' ? 'Long' : 'Short';
    });
  },

  byWeekday: function (trades) {
    var names = weekdayNames();
    var groups = Stats.groupBy(trades, function (t) {
      var d = (t.exitDate || t.entryDate || '').slice(0, 10);
      if (!d) return '';
      var day = new Date(d + 'T00:00:00').getDay();
      return names[day];
    });
    var order = names.slice();
    return groups.sort(function (a, b) {
      return order.indexOf(a.key) - order.indexOf(b.key);
    });
  },

  byHour: function (trades) {
    return Stats.groupBy(trades, function (t) {
      var dt = t.entryDate || '';
      if (dt.indexOf('T') === -1) return '';
      var h = dt.slice(11, 13);
      if (!h) return '';
      return h + ':00';
    }).sort(function (a, b) { return a.key.localeCompare(b.key); });
  },

  byMonth: function (trades) {
    return Stats.groupBy(trades, function (t) {
      var d = (t.exitDate || t.entryDate || '').slice(0, 10);
      return d ? d.slice(0, 7) : '';
    }).sort(function (a, b) { return a.key.localeCompare(b.key); });
  },

  byMood: function (trades) {
    return Stats.groupBy(trades, function (tr) { return tr.mood || t('Tidak diisi'); });
  },

  byQuality: function (trades) {
    var groups = Stats.groupBy(trades, function (tr) {
      return tr.quality > 0 ? t('{n} dari 5', { n: tr.quality }) : t('Tidak dinilai');
    });
    return groups.sort(function (a, b) { return a.key.localeCompare(b.key); });
  },

  byTag: function (trades) {
    var flat = [];
    trades.forEach(function (t) {
      (t.tags || []).forEach(function (tag) {
        flat.push(Object.assign({}, t, { _tag: tag }));
      });
    });
    return Stats.groupBy(flat, function (t) { return t._tag; });
  },

  /* ---------- Distribusi R multiple ---------- */

  rDistribution: function (trades) {
    var bins = [
      { label: 'R < -1', from: -Infinity, to: -1, count: 0, pnl: 0 },
      { label: t('-1 s/d 0'), from: -1, to: 0, count: 0, pnl: 0 },
      { label: t('0 s/d 1'), from: 0, to: 1, count: 0, pnl: 0 },
      { label: t('1 s/d 2'), from: 1, to: 2, count: 0, pnl: 0 },
      { label: t('2 s/d 3'), from: 2, to: 3, count: 0, pnl: 0 },
      { label: 'R > 3', from: 3, to: Infinity, count: 0, pnl: 0 }
    ];

    trades.forEach(function (t) {
      for (var i = 0; i < bins.length; i++) {
        var b = bins[i];
        if (t.rMultiple > b.from && t.rMultiple <= b.to) {
          b.count++;
          b.pnl += t.pnl;
          break;
        }
      }
    });

    return bins;
  },

  /* ---------- Bulan berjalan vs sebelumnya ---------- */

  monthCompare: function (trades) {
    var now = new Date();
    var thisKey = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0');

    var prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var prevKey = prevDate.getFullYear() + '-' +
      String(prevDate.getMonth() + 1).padStart(2, '0');

    var sum = function (key) {
      return Stats.closed(trades).reduce(function (acc, t) {
        var d = (t.exitDate || t.entryDate || '').slice(0, 7);
        return d === key ? acc + t.pnl : acc;
      }, 0);
    };
    var count = function (key) {
      return trades.filter(function (t) {
        return (t.entryDate || '').slice(0, 7) === key;
      }).length;
    };

    return {
      thisKey: thisKey,
      prevKey: prevKey,
      thisPnl: sum(thisKey),
      prevPnl: sum(prevKey),
      thisCount: count(thisKey),
      prevCount: count(prevKey)
    };
  },

  /* ---------- Pelanggaran aturan ---------- */

  violations: function (state) {
    var out = [];
    var settings = state.settings;
    var capital = settings.initialCapital;
    var closed = Stats.sortClosed(state.trades);

    // 1. Risiko per trade melebihi batas
    var maxRiskAmount = capital * (settings.maxRiskPctTrade / 100);
    if (maxRiskAmount > 0) {
      state.trades.forEach(function (tr) {
        if (tr.risk > maxRiskAmount * 1.0001) {
          out.push({
            type: t('Risiko per trade'),
            detail: t('{sym} pada {date} berisikan {risk}, melebihi batas {limit}',
              { sym: tr.symbol, date: shortDate(tr.entryDate),
                risk: fmtMoney(settings.currency, tr.risk),
                limit: fmtMoney(settings.currency, maxRiskAmount) }),
            tradeId: tr.id
          });
        }
      });
    }

    // 2. Kerugian harian melebihi batas
    var daily = Stats.dailyMap(closed);
    var maxDailyLoss = capital * (settings.maxDailyLossPct / 100);
    if (maxDailyLoss > 0) {
      Object.keys(daily).forEach(function (day) {
        if (daily[day].pnl < -maxDailyLoss) {
          out.push({
            type: t('Batas rugi harian'),
            detail: t('{date} rugi {loss}, melebihi batas {limit}',
              { date: shortDate(day),
                loss: fmtMoney(settings.currency, Math.abs(daily[day].pnl)),
                limit: fmtMoney(settings.currency, maxDailyLoss) }),
            tradeId: null
          });
        }
      });
    }

    // 3. Rentetan rugi beruntun
    var run = 0;
    closed.forEach(function (tr) {
      if (tr.result === 'loss') {
        run++;
        if (run === settings.maxLossStreak) {
          out.push({
            type: t('Rugi beruntun'),
            detail: t('Sudah {n} rugi beruntun sampai trade {sym} pada {date}. Seharusnya berhenti.',
              { n: run, sym: tr.symbol, date: shortDate(tr.exitDate || tr.entryDate) }),
            tradeId: tr.id
          });
        }
      } else if (tr.result === 'win') {
        run = 0;
      }
    });

    return out;
  },

  /* ---------- Pelanggaran pada hari berjalan ---------- */

  todayRisk: function (state) {
    var today = new Date().toISOString().slice(0, 10);
    var dayTrades = state.trades.filter(function (t) {
      return (t.status === 'open' ? t.entryDate : (t.exitDate || t.entryDate) || '')
        .slice(0, 10) === today;
    });
    var pnl = dayTrades.reduce(function (a, t) {
      return a + (t.status === 'closed' ? t.pnl : 0);
    }, 0);
    var riskUsed = dayTrades.reduce(function (a, t) { return a + t.risk; }, 0);

    var capital = state.settings.initialCapital;
    var dailyLimit = capital * (state.settings.maxDailyLossPct / 100);
    var riskLimit = capital * (state.settings.maxRiskPctTrade / 100);

    return {
      date: today,
      trades: dayTrades,
      pnl: pnl,
      riskUsed: riskUsed,
      dailyLimit: dailyLimit,
      riskLimit: riskLimit,
      hitDailyLoss: dailyLimit > 0 && pnl <= -dailyLimit,
      hitRisk: riskLimit > 0 && riskUsed > riskLimit
    };
  },

  /* ---------- Ringkasan untuk sidebar ---------- */

  sidebar: function (state) {
    var s = Stats.summary(state);
    return [
      { label: t('Modal'), value: fmtMoney(state.settings.currency, s.capitalNow) },
      { label: t('Total P/L'), value: fmtSigned(state.settings.currency, s.totalPnl), cls: signClass(s.totalPnl) },
      { label: t('Win rate'), value: s.winRate.toFixed(1) + '%' },
      { label: t('Profit factor'),
        value: isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : 'n/a' }
    ];
  }
};

/* ---------- Helper format (dipakai juga oleh app.js) ---------- */

function fmtMoney(currency, value) {
  var c = currency || '$';
  var n = Number(value) || 0;
  var sign = n < 0 ? '-' : '';
  return sign + c + Math.abs(n).toLocaleString(numLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtSigned(currency, value) {
  var n = Number(value) || 0;
  var body = fmtMoney(currency, Math.abs(n));
  if (n > 0) return '+' + body;
  if (n < 0) return '-' + body;
  return body;
}

function signClass(value) {
  if (value > 0) return 'pos';
  if (value < 0) return 'neg';
  return 'flat';
}

function shortDate(value) {
  if (!value) return '-';
  var d = value.slice(0, 10);
  if (d.length < 10) return value;
  var parts = d.split('-');
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function shortDateTime(value) {
  if (!value) return '-';
  var date = shortDate(value);
  if (value.indexOf('T') === -1) return date;
  return date + ' ' + value.slice(11, 16);
}

function monthLabel(key) {
  var names = monthNames();
  if (!key || key.length < 7) return key;
  var y = key.slice(0, 4);
  var m = parseInt(key.slice(5, 7), 10) - 1;
  return (names[m] || '?') + ' ' + y;
}
