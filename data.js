/* 地図の色データの読み込み（LP・編集ページ共通）
 * 本番：/api/map（src/index.js → Cloudflare D1）から読み込みます。
 * APIにつながらないとき（ファイルを直接開いたときなど）は下の FALLBACK を使います。 */
(function () {
  var DEFAULT_STATUSES = [
    { code: "visited", label: "行った", color: "#d7262e", sort_order: 1, counts_as_visited: true },
    { code: "next", label: "次に行く", color: "#1f5fbf", sort_order: 2, counts_as_visited: false },
    { code: "none", label: "まだ", color: "#ffffff", sort_order: 3, counts_as_visited: false }
  ];

  // APIにつながらないときの表示（静岡＝行った、山口＝次に行く）
  var FALLBACK = { updated: null, checked: [22], next: [35] };

  function fromLocalFile() {
    var d = FALLBACK, states = {};
    for (var c = 1; c <= 47; c++) states[c] = "none";
    (d.next || []).forEach(function (c) { states[c] = "next"; });
    (d.checked || []).forEach(function (c) { states[c] = "visited"; });
    return { updated: d.updated || null, statuses: DEFAULT_STATUSES, states: states, source: "file" };
  }

  async function load() {
    try {
      var r = await fetch("/api/map", { cache: "no-store" });
      if (r.ok) { var d = await r.json(); d.source = "db"; return d; }
    } catch (e) {}
    return fromLocalFile();
  }

  function statusMap(d) {
    var m = {};
    d.statuses.forEach(function (s) { m[s.code] = s; });
    return m;
  }

  // 地図に塗る色 { 県コード: "#色" }（「まだ」は塗らない）
  function colors(d) {
    var sm = statusMap(d), out = {};
    Object.keys(d.states).forEach(function (c) {
      var s = sm[d.states[c]];
      if (s && s.code !== "none") out[c] = s.color;
    });
    return out;
  }

  // 日時の表示（D1はUTCなので日本時間に直す）
  function formatUpdated(v) {
    if (!v) return "—";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.replace(/-/g, ".");
    var t = new Date(v.replace(" ", "T") + "Z");
    if (isNaN(t)) return v;
    return t.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, ".");
  }

  window.MapData = { load: load, statusMap: statusMap, colors: colors, formatUpdated: formatUpdated };
})();
