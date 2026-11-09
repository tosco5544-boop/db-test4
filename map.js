/* 日本地図の描画（県名つき）
 * 地図の形は amCharts の公開地図データを CDN から読み込みます。 */
(function () {
  var NAMES = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
  var EN = ["hokkaido","aomori","iwate","miyagi","akita","yamagata","fukushima","ibaraki","tochigi","gunma","saitama","chiba","tokyo","kanagawa","niigata","toyama","ishikawa","fukui","yamanashi","nagano","gifu","shizuoka","aichi","mie","shiga","kyoto","osaka","hyogo","nara","wakayama","tottori","shimane","okayama","hiroshima","yamaguchi","tokushima","kagawa","ehime","kochi","fukuoka","saga","nagasaki","kumamoto","oita","miyazaki","kagoshima","okinawa"];
  var REGIONS = [
    ["北海道・東北", 1, 7], ["関東", 8, 14], ["中部", 15, 23], ["近畿", 24, 30],
    ["中国", 31, 35], ["四国", 36, 39], ["九州・沖縄", 40, 47]
  ];
  // 地図上の県名の位置の微調整（x, y）
  var NUDGE = { 11: [0, -4], 12: [10, 8], 13: [-6, 0], 14: [2, 6], 26: [-4, -8], 27: [-4, 2], 28: [-8, 0], 37: [0, -2], 47: [0, 0] };

  var SOURCES = [
    "https://cdn.jsdelivr.net/npm/@amcharts/amcharts5-geodata@5.1.4/japanLow.js",
    "https://cdn.jsdelivr.net/npm/@amcharts/amcharts5-geodata@5.1.2/japanLow.js",
    "https://unpkg.com/@amcharts/amcharts5-geodata@5.1.4/japanLow.js",
    "https://cdn.jsdelivr.net/npm/@amcharts/amcharts4-geodata@4.1.28/japanLow.js"
  ];

  function shortName(c) { return c === 1 ? "北海道" : NAMES[c - 1].replace(/[都府県]$/, ""); }

  async function loadGeo() {
    for (var i = 0; i < SOURCES.length; i++) {
      try {
        var m = await import(SOURCES[i]);
        var d = m.default || m;
        if (d && d.features) return d;
      } catch (e) {}
    }
    throw new Error("地図データを読み込めませんでした");
  }

  function codeOf(f) {
    var p = f.properties || {};
    var id = String(p.id || f.id || "");
    var m = id.match(/JP-?(\d{1,2})/i);
    if (m) return +m[1];
    var nm = String(p.name || "").toLowerCase().replace(/[^a-z]/g, "");
    var i = EN.findIndex(function (e) { return nm.indexOf(e) === 0; });
    return i >= 0 ? i + 1 : 0;
  }
  function polys(g) { return g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []; }
  function merc(c) { return [c[0], -Math.log(Math.tan(Math.PI / 4 + c[1] * Math.PI / 360)) * 180 / Math.PI]; }

  function bbox(list) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    list.forEach(function (it) { it.ps.forEach(function (p) { p.forEach(function (r) { r.forEach(function (c) {
      var xy = merc(c);
      b.x0 = Math.min(b.x0, xy[0]); b.x1 = Math.max(b.x1, xy[0]);
      b.y0 = Math.min(b.y0, xy[1]); b.y1 = Math.max(b.y1, xy[1]);
    }); }); }); });
    return b;
  }

  // 一番大きい島の重心（県名の位置）
  function labelPoint(ps, f) {
    var best = null, bestA = 0;
    ps.forEach(function (p) {
      var r = p[0].map(f), a = 0, cx = 0, cy = 0;
      for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
        var k = r[j][0] * r[i][1] - r[i][0] * r[j][1];
        a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k;
      }
      if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
    });
    return best;
  }

  function build(geo) {
    var W = 1000, H = 1000, pad = 20;
    var items = [];
    geo.features.forEach(function (f) {
      var code = codeOf(f);
      if (!code) return;
      var ps = polys(f.geometry);
      if (code === 13) ps = ps.filter(function (p) { return p[0].some(function (c) { return c[1] > 32; }); });
      items.push({ code: code, ps: ps });
    });
    var main = items.filter(function (i) { return i.code !== 47; });
    var oki = items.filter(function (i) { return i.code === 47; });
    var b = bbox(main);
    var s = Math.min((W - pad * 2) / (b.x1 - b.x0), (H - pad * 2) / (b.y1 - b.y0));
    var mw = (b.x1 - b.x0) * s, mh = (b.y1 - b.y0) * s;
    var ox = W - pad - mw, oy = pad + (H - pad * 2 - mh) / 2;
    var fMain = function (c) { var xy = merc(c); return [ox + (xy[0] - b.x0) * s, oy + (xy[1] - b.y0) * s]; };
    var fOki = null, box = null;
    if (oki.length) {
      var ob = bbox(oki), bw = 230, bh = 200, bx = pad, by = pad + 40;
      var os = Math.min((bw - 24) / (ob.x1 - ob.x0), (bh - 24) / (ob.y1 - ob.y0), s);
      var ix = bx + (bw - (ob.x1 - ob.x0) * os) / 2, iy = by + (bh - (ob.y1 - ob.y0) * os) / 2;
      fOki = function (c) { var xy = merc(c); return [ix + (xy[0] - ob.x0) * os, iy + (xy[1] - ob.y0) * os]; };
      box = { x: bx, y: by, w: bw, h: bh };
    }
    items.forEach(function (it) {
      var f = it.code === 47 ? fOki : fMain;
      it.d = it.ps.map(function (p) { return p.map(function (r) {
        var out = "", lx = null, ly = null;
        r.forEach(function (c, i) {
          var xy = f(c);
          if (i && i < r.length - 1 && Math.abs(xy[0] - lx) < 0.4 && Math.abs(xy[1] - ly) < 0.4) return;
          out += (i ? "L" : "M") + xy[0].toFixed(1) + "," + xy[1].toFixed(1); lx = xy[0]; ly = xy[1];
        });
        return out + "Z";
      }).join(""); }).join("");
      var lp = labelPoint(it.ps, f), n = NUDGE[it.code] || [0, 0];
      it.label = [lp[0] + n[0], lp[1] + n[1]];
    });
    if (box) { var o = items.find(function (i) { return i.code === 47; }); if (o) o.label = [box.x + box.w / 2, box.y + box.h - 14]; }
    return { W: W, H: H, items: items, box: box };
  }

  // 色が暗いかどうか（県名を白文字にするため）
  function isDark(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return false;
    var n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) < 150;
  }

  /* container: 地図を入れる要素
   * opts.colors: { 県コード: "#色" } 塗る県だけ指定（指定のない県は白地）
   * opts.editable: true ならタップできる
   * opts.onTap(code): タップされた県コード */
  async function create(container, opts) {
    opts = opts || {};
    var colors = opts.colors || {};
    var data = build(await loadGeo());
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + data.W + " " + data.H);
    svg.setAttribute("class", "jmap" + (opts.editable ? " is-editable" : ""));
    svg.setAttribute("aria-label", "日本の都道府県地図");
    if (data.box) {
      var r = document.createElementNS(NS, "rect");
      [["x", data.box.x], ["y", data.box.y], ["width", data.box.w], ["height", data.box.h], ["rx", 4], ["class", "jmap-inset"]].forEach(function (a) { r.setAttribute(a[0], a[1]); });
      svg.appendChild(r);
    }
    var gShapes = document.createElementNS(NS, "g"), gLabels = document.createElementNS(NS, "g");
    gLabels.setAttribute("class", "jmap-labels");
    gLabels.setAttribute("aria-hidden", "true");
    var paths = {}, labels = {};
    data.items.forEach(function (it) {
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", it.d);
      p.setAttribute("class", "jmap-pref");
      p.setAttribute("fill-rule", "evenodd");
      p.dataset.code = it.code;
      if (opts.editable) { p.setAttribute("tabindex", "0"); p.setAttribute("role", "button"); }
      var t = document.createElementNS(NS, "title"); t.textContent = NAMES[it.code - 1]; p.appendChild(t);
      gShapes.appendChild(p);
      (paths[it.code] = paths[it.code] || []).push(p);
      if (!labels[it.code]) {
        var tx = document.createElementNS(NS, "text");
        tx.setAttribute("x", it.label[0].toFixed(1));
        tx.setAttribute("y", it.label[1].toFixed(1));
        tx.setAttribute("class", "jmap-label");
        tx.textContent = shortName(it.code);
        gLabels.appendChild(tx);
        labels[it.code] = tx;
      }
    });
    svg.appendChild(gShapes); svg.appendChild(gLabels);
    container.textContent = "";
    container.appendChild(svg);

    function paint() {
      Object.keys(paths).forEach(function (c) {
        var col = colors[c] || "";
        paths[c].forEach(function (p) { p.style.fill = col; p.classList.toggle("is-filled", !!col); });
        if (labels[c]) labels[c].classList.toggle("is-dark", isDark(col));
      });
    }
    if (opts.editable) {
      var tap = function (code) { opts.onTap && opts.onTap(code); };
      svg.addEventListener("click", function (e) { var p = e.target.closest(".jmap-pref"); if (p) tap(+p.dataset.code); });
      svg.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var p = e.target.closest(".jmap-pref"); if (p) { e.preventDefault(); tap(+p.dataset.code); }
      });
    }
    paint();
    return { setColors: function (c) { colors = c || {}; paint(); } };
  }

  window.JapanMap = { NAMES: NAMES, REGIONS: REGIONS, create: create, shortName: shortName, isDark: isDark };
})();
