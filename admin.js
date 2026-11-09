/* 編集ページ：色を選んで県をタップ → /api/state でデータベースを更新します。
 * ログインしていなければログイン画面（/login）へ移動します。 */
(function () {
  var J = window.JapanMap, MD = window.MapData;
  var data = null, sm = {}, brush = "visited", canEdit = false, map = null;

  var toastEl = document.getElementById("toast"), toastTimer;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("is-error", !!isError);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, isError ? 5000 : 2000);
  }
  function notice(msg) {
    var n = document.getElementById("notice");
    n.textContent = msg; n.hidden = !msg;
  }

  /* ---- 表示 ---- */
  function renderBrushes() {
    var wrap = document.getElementById("brushes");
    wrap.textContent = "";
    data.statuses.slice().sort(function (a, b) { return a.sort_order - b.sort_order; }).forEach(function (s) {
      var b = document.createElement("button"), i = document.createElement("i");
      b.type = "button"; b.className = "brush"; b.dataset.code = s.code;
      b.setAttribute("aria-pressed", s.code === brush);
      if (s.code !== "none") { i.style.background = s.color; i.style.borderColor = s.color; }
      b.appendChild(i); b.appendChild(document.createTextNode(s.label));
      b.disabled = !canEdit;
      b.addEventListener("click", function () { brush = s.code; renderBrushes(); });
      wrap.appendChild(b);
    });
  }

  function renderList() {
    var wrap = document.getElementById("regions");
    wrap.textContent = "";
    J.REGIONS.forEach(function (r) {
      var div = document.createElement("div"), h = document.createElement("h3"), ul = document.createElement("ul"), n = 0;
      div.className = "region";
      for (var c = r[1]; c <= r[2]; c++) {
        var s = sm[data.states[c]];
        if (s && s.counts_as_visited) n++;
        var li = document.createElement("li"), b = document.createElement("button");
        b.type = "button"; b.className = "pill"; b.textContent = J.NAMES[c - 1]; b.dataset.code = c;
        b.disabled = !canEdit;
        if (s && s.code !== "none") {
          b.style.background = s.color; b.style.borderColor = s.color;
          b.style.color = J.isDark(s.color) ? "#fff" : "#1d2024";
          b.title = s.label;
        }
        li.appendChild(b); ul.appendChild(li);
      }
      h.textContent = r[0];
      var cnt = document.createElement("span"); cnt.textContent = n + " / " + (r[2] - r[1] + 1); h.appendChild(cnt);
      div.appendChild(h); div.appendChild(ul); wrap.appendChild(div);
    });
  }

  function renderSummary() {
    var counts = {};
    for (var c = 1; c <= 47; c++) counts[data.states[c]] = (counts[data.states[c]] || 0) + 1;
    document.getElementById("summary").textContent = data.statuses
      .filter(function (s) { return s.code !== "none"; })
      .map(function (s) { return s.label + " " + (counts[s.code] || 0); }).join("　");
  }

  function renderAll() {
    sm = MD.statusMap(data);
    if (!sm[brush]) brush = data.statuses[0] && data.statuses[0].code;
    renderBrushes(); renderList(); renderSummary();
    if (map) map.setColors(MD.colors(data));
  }

  /* ---- 色の切り替え ---- */
  var saving = false;
  async function change(code) {
    if (!canEdit || saving) return;
    var name = J.NAMES[code - 1];
    // 同じ色の県をタップしたら「まだ」に戻す
    var target = data.states[code] === brush ? "none" : brush;
    var before = data.states[code];
    data.states[code] = target; renderAll(); // 先に画面だけ変える
    saving = true;
    try {
      var r = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefecture_id: code, status: target }),
        credentials: "same-origin"
      });
      var res = await r.json().catch(function () { return {}; });
      if (r.status === 401) { location.replace("/login"); return; }
      if (!r.ok) throw new Error(res.error || "保存できませんでした（" + r.status + "）");
      data = res; renderAll();
      toast(name + "を「" + (sm[target] ? sm[target].label : target) + "」にしました");
    } catch (e) {
      data.states[code] = before; renderAll();
      toast(e.message + "。もう一度タップしてください。", true);
    } finally {
      saving = false;
    }
  }

  document.getElementById("logout").addEventListener("click", function () {
    fetch("/api/logout", { method: "POST", credentials: "same-origin" }).finally(function () { location.replace("/login"); });
  });

  document.getElementById("regions").addEventListener("click", function (e) {
    var b = e.target.closest("button.pill"); if (b) change(+b.dataset.code);
  });

  var scroll = document.getElementById("mapScroll"), zb = document.getElementById("zoom");
  zb.addEventListener("click", function () {
    var z = scroll.classList.toggle("is-zoom");
    zb.textContent = z ? "全体を表示" : "地図を拡大";
  });

  /* ---- 起動 ---- */
  (async function () {
    var meRes = null;
    try {
      var r = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
      if (r.status === 401) { location.replace("/login"); return; }
      var text = await r.text(), j = null;
      try { j = JSON.parse(text); } catch (e) {}
      if (r.ok && j && j.username) meRes = j;
      else notice((j && j.error) || "ログイン状態を確認できませんでした（" + r.status + "）。");
    } catch (e) {
      notice("サーバーにつながりません。npx wrangler dev で起動したページか、デプロイしたページで開いてください。");
    }
    canEdit = !!meRes;
    document.getElementById("who").textContent = meRes ? (meRes.username + " でログイン中") : "閲覧のみ";

    data = await MD.load();
    if (data.source !== "db" && canEdit) { canEdit = false; notice("データベースから読み込めませんでした。D1 のバインディングを確認してください。"); }
    renderAll();

    try {
      map = await J.create(document.getElementById("mapBox"), { editable: true, colors: MD.colors(data), onTap: change });
    } catch (e) {
      document.getElementById("mapBox").innerHTML = '<div class="map-status">地図を読み込めませんでした。下の一覧から切り替えられます。</div>';
    }
  })();
})();
