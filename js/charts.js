/* =========================================================
   charts.js - Grafik SVG sederhana tanpa pustaka luar
   ========================================================= */

var Charts = {

  empty: function (msg) {
    return '<div class="chart-empty">' + esc(msg || 'Belum ada data untuk ditampilkan') + '</div>';
  },

  /* ---------- Grafik garis (equity curve) ----------
     opts: { values, labels, height, color, format }      */

  line: function (opts) {
    var values = opts.values || [];
    if (values.length < 2) return Charts.empty(opts.emptyMsg);

    var height = opts.height || 220;
    var padL = 62, padR = 16, padT = 16, padB = 26;
    var width = 720;
    var innerW = width - padL - padR;
    var innerH = height - padT - padB;
    var color = opts.color || '#3b82f6';
    var format = opts.format || function (v) { return String(Math.round(v)); };

    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;

    // sedikit ruang di atas dan bawah
    min -= span * 0.08;
    max += span * 0.08;
    span = max - min;

    var x = function (i) {
      return padL + (i / (values.length - 1)) * innerW;
    };
    var y = function (v) {
      return padT + innerH - ((v - min) / span) * innerH;
    };

    var parts = [];

    // grid horizontal + label sumbu Y
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var val = min + (span * t) / ticks;
      var yy = y(val);
      parts.push('<line class="grid-line" x1="' + padL + '" y1="' + yy.toFixed(1) +
        '" x2="' + (width - padR) + '" y2="' + yy.toFixed(1) + '"/>');
      parts.push('<text class="axis-txt" x="' + (padL - 7) + '" y="' + (yy + 3.5).toFixed(1) +
        '" text-anchor="end">' + esc(format(val)) + '</text>');
    }

    // garis nol bila termuat di rentang
    if (min < 0 && max > 0) {
      var zeroY = y(0);
      parts.push('<line x1="' + padL + '" y1="' + zeroY.toFixed(1) + '" x2="' +
        (width - padR) + '" y2="' + zeroY.toFixed(1) +
        '" stroke="#6b7a89" stroke-width="1" stroke-dasharray="4 4"/>');
    }

    // area fill
    var linePts = values.map(function (v, i) {
      return x(i).toFixed(1) + ',' + y(v).toFixed(1);
    });
    var areaPath = 'M' + linePts.join(' L') +
      ' L' + x(values.length - 1).toFixed(1) + ',' + (padT + innerH) +
      ' L' + x(0).toFixed(1) + ',' + (padT + innerH) + ' Z';

    parts.push('<path d="' + areaPath + '" fill="' + color + '" fill-opacity="0.12"/>');
    parts.push('<polyline fill="none" stroke="' + color +
      '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="' +
      linePts.join(' ') + '"/>');

    // titik dengan tooltip
    var labelSet = opts.labels || [];
    var step = Math.max(1, Math.ceil(values.length / 40));
    values.forEach(function (v, i) {
      if (i % step !== 0 && i !== values.length - 1) return;
      var tip = (labelSet[i] ? labelSet[i] + ' - ' : '') + format(v);
      parts.push('<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) +
        '" r="3" fill="' + color + '"><title>' + esc(tip) + '</title></circle>');
    });

    // label sumbu X (awal, tengah, akhir)
    [0, Math.floor((values.length - 1) / 2), values.length - 1].forEach(function (i, idx) {
      var anchor = idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle';
      var text = labelSet[i] || '';
      if (!text) return;
      parts.push('<text class="axis-txt" x="' + x(i).toFixed(1) + '" y="' + (height - 8) +
        '" text-anchor="' + anchor + '">' + esc(text) + '</text>');
    });

    return '<div class="chart"><svg viewBox="0 0 ' + width + ' ' + height +
      '" preserveAspectRatio="none" role="img">' + parts.join('') + '</svg></div>';
  },

  /* ---------- Grafik batang vertical ----------
     opts: { labels, values, height, format, colorFn }    */

  bars: function (opts) {
    var labels = opts.labels || [];
    var values = opts.values || [];
    if (!values.length) return Charts.empty(opts.emptyMsg);

    var height = opts.height || 210;
    var padL = 58, padR = 12, padT = 14, padB = 30;
    var width = 720;
    var innerW = width - padL - padR;
    var innerH = height - padT - padB;
    var format = opts.format || function (v) { return String(v); };
    var colorFn = opts.colorFn || function () { return opts.color || '#3b82f6'; };

    var min = Math.min(0, Math.min.apply(null, values));
    var max = Math.max(0, Math.max.apply(null, values));
    if (min === max) { max = min + 1; }
    var span = max - min;

    var y = function (v) { return padT + innerH - ((v - min) / span) * innerH; };
    var zeroY = y(0);

    var band = innerW / values.length;
    var barW = Math.max(6, Math.min(46, band * 0.62));
    var parts = [];

    // grid
    for (var t = 0; t <= 4; t++) {
      var val = min + (span * t) / 4;
      var yy = y(val);
      parts.push('<line class="grid-line" x1="' + padL + '" y1="' + yy.toFixed(1) +
        '" x2="' + (width - padR) + '" y2="' + yy.toFixed(1) + '"/>');
      parts.push('<text class="axis-txt" x="' + (padL - 7) + '" y="' + (yy + 3.5).toFixed(1) +
        '" text-anchor="end">' + esc(format(val)) + '</text>');
    }

    values.forEach(function (v, i) {
      var cx = padL + band * i + band / 2;
      var top = v >= 0 ? y(v) : zeroY;
      var h = Math.max(1, Math.abs(zeroY - y(v)));
      var color = colorFn(v, i);
      var tip = (labels[i] || '') + ': ' + format(v);

      parts.push('<rect x="' + (cx - barW / 2).toFixed(1) + '" y="' + top.toFixed(1) +
        '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) +
        '" rx="3" fill="' + color + '"><title>' + esc(tip) + '</title></rect>');

      // label nilai di atas/bawah batang
      if (values.length <= 16) {
        var ly = v >= 0 ? top - 5 : top + h + 12;
        parts.push('<text class="val-txt" x="' + cx.toFixed(1) + '" y="' + ly.toFixed(1) +
          '" text-anchor="middle" fill="' + color + '">' + esc(format(v)) + '</text>');
      }

      // label sumbu X
      var text = String(labels[i] || '');
      if (text.length > 9) text = text.slice(0, 9);
      parts.push('<text class="axis-txt" x="' + cx.toFixed(1) + '" y="' + (height - 10) +
        '" text-anchor="middle">' + esc(text) + '</text>');
    });

    // garis nol
    parts.push('<line x1="' + padL + '" y1="' + zeroY.toFixed(1) + '" x2="' +
      (width - padR) + '" y2="' + zeroY.toFixed(1) +
      '" stroke="#6b7a89" stroke-width="1.2"/>');

    return '<div class="chart"><svg viewBox="0 0 ' + width + ' ' + height +
      '" preserveAspectRatio="none" role="img">' + parts.join('') + '</svg></div>';
  },

  /* ---------- Batang horizontal (peringkat) ----------
     opts: { items: [{label, value}], format }           */

  hbars: function (opts) {
    var items = (opts.items || []).slice(0, 14);
    if (!items.length) return Charts.empty(opts.emptyMsg);

    var format = opts.format || function (v) { return String(v); };
    var maxAbs = Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); }));
    if (maxAbs === 0) maxAbs = 1;

    var rows = items.map(function (item) {
      var pct = (Math.abs(item.value) / maxAbs) * 100;
      var cls = item.value >= 0 ? 'green' : 'red';
      var color = item.value >= 0 ? 'var(--green)' : 'var(--red)';
      return '' +
        '<div class="meter-row">' +
          '<div class="lbl">' +
            '<span>' + esc(item.label) + '</span>' +
            '<span class="mono" style="color:' + color + '">' +
              esc(format(item.value)) +
            '</span>' +
          '</div>' +
          '<div class="bar-track">' +
            '<div class="bar-fill ' + cls + '" style="width:' + pct.toFixed(1) + '%"></div>' +
          '</div>' +
        '</div>';
    });

    return rows.join('');
  },

  /* ---------- Donat sederhana (win vs loss) ----------
     opts: { parts: [{label, value, color}] }            */

  donut: function (opts) {
    var parts = (opts.parts || []).filter(function (p) { return p.value > 0; });
    var total = parts.reduce(function (a, p) { return a + p.value; }, 0);
    if (total === 0) return Charts.empty(opts.emptyMsg || 'Belum ada data');

    var size = 132, r = 48, cx = size / 2, cy = size / 2;
    var circ = 2 * Math.PI * r;
    var offset = 0;
    var svg = [];

    parts.forEach(function (p) {
      var frac = p.value / total;
      var len = frac * circ;
      svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
        '" fill="none" stroke="' + p.color + '" stroke-width="20" ' +
        'stroke-dasharray="' + len.toFixed(2) + ' ' + (circ - len).toFixed(2) + '" ' +
        'stroke-dashoffset="' + (-offset).toFixed(2) + '" ' +
        'transform="rotate(-90 ' + cx + ' ' + cy + ')">' +
        '<title>' + esc(p.label + ': ' + p.value) + '</title></circle>');
      offset += len;
    });

    var html = '<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">';
    html += '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      svg.join('') +
      '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" ' +
      'fill="var(--text)" font-size="20" font-weight="700" font-family="Consolas, monospace">' +
      total + '</text></svg>';

    html += '<div style="display:flex;flex-direction:column;gap:7px">';
    parts.forEach(function (p) {
      html += '<div style="font-size:12.5px;color:var(--text-2)">' +
        '<i style="display:inline-block;width:10px;height:10px;border-radius:3px;' +
        'background:' + p.color + ';margin-right:7px"></i>' +
        esc(p.label) + ' - <b style="color:var(--text)">' + p.value + '</b> (' +
        ((p.value / total) * 100).toFixed(0) + '%)</div>';
    });
    html += '</div></div>';

    return html;
  }
};
