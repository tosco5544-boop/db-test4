/* LP：データベースの色を地図・一覧・達成数に反映します（閲覧のみ）。 */
(function () {
  var J = window.JapanMap, MD = window.MapData;

  // 凡例・一覧の色つきラベル
  function pillStyle(s) {
    if (!s || s.code === "none") return "";
    return "background:" + s.color + ";border-color:" + s.color + ";color:" + (J.isDark(s.color) ? "#fff" : "#1d2024");
  }

  MD.load().then(function (d) {
    var sm = MD.statusMap(d);

    // 達成数・次の目的地・更新日
    var visited = 0, next = [];
    for (var c = 1; c <= 47; c++) {
      var s = sm[d.states[c]];
      if (s && s.counts_as_visited) visited++;
      if (d.states[c] === "next") next.push(J.NAMES[c - 1]);
    }
    document.getElementById("count").textContent = visited;
    var rate = Math.round(visited / 47 * 100);
    document.getElementById("rate").textContent = "達成率 " + rate + "%";
    requestAnimationFrame(function () { document.getElementById("bar").style.width = rate + "%"; });
    var nl = document.getElementById("nextLine");
    if (next.length) {
      nl.textContent = "次の目的地：" + next.join("・");
      if (sm.next) nl.style.color = sm.next.color;
      nl.hidden = false;
    }
    document.getElementById("updated").textContent = "最終更新：" + MD.formatUpdated(d.updated);

    // 凡例
    var lg = document.getElementById("legend");
    lg.textContent = "";
    d.statuses.slice().sort(function (a, b) { return a.sort_order - b.sort_order; }).forEach(function (s) {
      var span = document.createElement("span"), i = document.createElement("i");
      if (s.code !== "none") { i.style.background = s.color; i.style.borderColor = s.color; }
      span.appendChild(i); span.appendChild(document.createTextNode(s.label));
      lg.appendChild(span);
    });

    // 地方別一覧
    var wrap = document.getElementById("regions");
    wrap.textContent = "";
    J.REGIONS.forEach(function (r) {
      var n = 0, div = document.createElement("div"), h = document.createElement("h3"), ul = document.createElement("ul");
      div.className = "region";
      for (var c = r[1]; c <= r[2]; c++) {
        var s = sm[d.states[c]];
        if (s && s.counts_as_visited) n++;
        var li = document.createElement("li"), sp = document.createElement("span");
        sp.className = "pill"; sp.textContent = J.NAMES[c - 1];
        sp.setAttribute("style", pillStyle(s));
        if (s && s.code !== "none") sp.title = s.label;
        li.appendChild(sp); ul.appendChild(li);
      }
      h.textContent = r[0];
      var cnt = document.createElement("span"); cnt.textContent = n + " / " + (r[2] - r[1] + 1); h.appendChild(cnt);
      div.appendChild(h); div.appendChild(ul); wrap.appendChild(div);
    });

    // 地図
    var box = document.getElementById("mapBox");
    J.create(box, { colors: MD.colors(d) }).catch(function () {
      box.innerHTML = '<div class="map-status">地図を読み込めませんでした。インターネット接続を確認して再読み込みしてください。</div>';
    });
  });

  // 拡大（スマホで県名を読みやすく）
  var scroll = document.getElementById("mapScroll"), zb = document.getElementById("zoom");
  zb.addEventListener("click", function () {
    var z = scroll.classList.toggle("is-zoom");
    zb.textContent = z ? "全体を表示" : "地図を拡大";
    if (z) { scroll.scrollLeft = scroll.scrollWidth * 0.35; scroll.scrollTop = scroll.scrollHeight * 0.3; }
  });
})();
