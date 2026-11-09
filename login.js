/* ログイン画面：ユーザー名とパスワードを /api/login に送り、成功したら編集画面へ移動します。
 * ログイン状態はサーバーが HttpOnly クッキーで管理するので、ブラウザ側で保存するものはありません。 */
(function () {
  var form = document.getElementById("form"), err = document.getElementById("err"), btn = document.getElementById("submit");

  // すでにログインしていれば編集画面へ
  fetch("/api/me", { cache: "no-store", credentials: "same-origin" }).then(function (r) {
    if (r.ok) location.replace("/admin");
  }).catch(function () {});

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var username = document.getElementById("username").value.trim();
    var password = document.getElementById("password").value;
    if (!username || !password) { err.textContent = "ユーザー名とパスワードを入力してください。"; return; }
    err.textContent = ""; btn.disabled = true; btn.textContent = "確認中…";
    try {
      var r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: username, password: password })
      });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.error || "ログインできませんでした（" + r.status + "）");
      location.replace("/admin");
    } catch (ex) {
      err.textContent = ex.message + "。";
      btn.disabled = false; btn.textContent = "ログイン";
    }
  });
})();
