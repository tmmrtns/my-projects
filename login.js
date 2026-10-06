// Shared login gate. Add <script src="../login.js"></script> to any page (path relative to that page).
// Signed in (via any page on this site) -> does nothing. Signed out -> full-screen login on top of the
// page; after signing in the page reloads, so a direct link lands on the page that was requested.
(function () {
  var me = document.currentScript;
  var base = me.src.replace(/[^/]*$/, '');
  // Signed-in subpages get a slim bar with the way back to the projects, always top left.
  function addNav() {
    var css = document.createElement('style');
    css.textContent =
      '#siteNav{position:fixed;top:0;left:0;right:0;height:40px;z-index:40;display:flex;align-items:center;padding:0 10px;' +
      'background:#25231f;box-sizing:border-box}' +
      '#siteNav a{color:#fbf8f1;text-decoration:none;font:600 14px system-ui,-apple-system,"Segoe UI",sans-serif;padding:6px 10px;border-radius:8px}' +
      '#siteNav a:hover,#siteNav a:focus-visible{background:rgba(255,255,255,.16);outline:none}' +
      'body{padding-top:40px!important;box-sizing:border-box}';
    document.head.appendChild(css);
    var nav = document.createElement('nav');
    nav.id = 'siteNav';
    nav.innerHTML = '<a href="' + base + '">← Projects</a>';
    document.body.insertBefore(nav, document.body.firstChild);
  }
  function boot() {
    if (window.localApi.syncing()) { if (!me.hasAttribute('data-hub')) addNav(); return; }
    var css = document.createElement('style');
    css.textContent =
      '#siteLogin{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:16px;overflow:auto;' +
      'background:#ece8df;color:#25231f;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}' +
      '#siteLogin form{background:#fbf8f1;border:1px solid rgba(37,35,31,.14);border-radius:18px;box-shadow:0 8px 28px rgba(37,35,31,.16);padding:26px;display:grid;gap:12px;width:100%;max-width:400px}' +
      '#siteLogin h1{margin:0;font-size:1.6rem}#siteLogin p{margin:0;color:#6b665b;font-size:.95rem}' +
      '#siteLogin label{font-size:.85rem;color:#6b665b;display:grid;gap:4px}' +
      '#siteLogin input{font:inherit;padding:11px;border:1px solid rgba(37,35,31,.14);border-radius:8px;background:#ece8df;color:#25231f;width:100%;box-sizing:border-box}' +
      '#siteLogin .go{font:inherit;padding:12px;font-weight:700;background:#2f4858;color:#fff;border:0;border-radius:10px;cursor:pointer}#siteLogin .go:disabled{opacity:.6}' +
      '#siteLogin .tg{font:inherit;background:none;border:0;color:#6b665b;text-decoration:underline;cursor:pointer}' +
      '#siteLogin .err{color:#b23a2a;font-size:.88rem}#siteLogin [hidden]{display:none}' +
      '@media (prefers-color-scheme:dark){#siteLogin{background:#171614;color:#ece8df}#siteLogin form{background:#22201d;border-color:rgba(236,232,223,.16)}' +
      '#siteLogin p,#siteLogin label,#siteLogin .tg{color:#a29c8f}#siteLogin input{background:#171614;color:#ece8df;border-color:rgba(236,232,223,.16)}#siteLogin .go{background:#8db3c6;color:#10181c}#siteLogin .err{color:#e5786a}}';
    document.head.appendChild(css);
    var box = document.createElement('div');
    box.id = 'siteLogin';
    box.innerHTML =
      '<form><h1>🔒 My Projects</h1><p>Sign in to continue.</p>' +
      '<label>Username <input name="u" autocomplete="username" required></label>' +
      '<label>Password <input name="p" type="password" autocomplete="current-password" required></label>' +
      '<label class="tk" hidden>GitHub token (one time, to create the account) <input name="t" type="password" autocomplete="off"></label>' +
      '<label>Data repository (owner/name) <input name="r" autocomplete="off" required></label>' +
      '<p class="err" role="alert" hidden></p>' +
      '<button class="go" type="submit">Sign in</button>' +
      '<button class="tg" type="button">First time? Create an account</button></form>';
    document.body.appendChild(box);
    document.documentElement.style.overflow = 'hidden';
    var f = box.querySelector('form'), q = function (s) { return box.querySelector(s); };
    f.r.value = window.localApi.repo();
    var creating = false;
    q('.tg').addEventListener('click', function () {
      creating = !creating;
      q('.tk').hidden = !creating; f.t.required = creating;
      f.p.autocomplete = creating ? 'new-password' : 'current-password';
      q('.go').textContent = creating ? 'Create account' : 'Sign in';
      q('.tg').textContent = creating ? 'Already have an account? Sign in' : 'First time? Create an account';
      q('.err').hidden = true;
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      q('.err').hidden = true; q('.go').disabled = true;
      q('.go').textContent = creating ? 'Creating…' : 'Signing in…';
      var repo = f.r.value.trim();
      (creating ? window.localApi.register(f.u.value, f.p.value, f.t.value.trim(), repo)
                : window.localApi.login(f.u.value, f.p.value, repo))
        .then(function () { location.reload(); })
        .catch(function (err) {
          q('.err').textContent = err.message || 'Could not sign in.'; q('.err').hidden = false;
          q('.go').disabled = false; q('.go').textContent = creating ? 'Create account' : 'Sign in';
        });
    });
  }
  function ready() {
    if (window.localApi) return boot();
    var s = document.createElement('script');
    s.src = base + 'cheapskate/local-api.js';
    s.onload = boot;
    document.head.appendChild(s);
  }
  if (document.body) ready(); else document.addEventListener('DOMContentLoaded', ready);
})();
