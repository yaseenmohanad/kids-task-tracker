/* ============================================================
   Supabase access layer - auth + REST over plain fetch.

   Deliberately dependency-free: the site has no build step, so instead of
   pulling in supabase-js from a CDN we talk to the two HTTP APIs directly.
   Both are small and stable:

     GoTrue   {url}/auth/v1/...   sign up, sign in, refresh, sign out
     PostgREST{url}/rest/v1/...   select / upsert rows

   Everything here is about *transport*. The merge rules live in script.js.

   Exposes window.KTT_CLOUD.
   ============================================================ */

(function () {
  "use strict";

  var SESSION_KEY = "kidsTaskTracker.session";

  // Refresh the access token this many ms before it actually expires, so a
  // sync never starts with a token that dies mid-flight.
  var REFRESH_MARGIN = 60 * 1000;

  var cfg = window.KTT_CONFIG || {};
  var URL_BASE = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  var ANON_KEY = String(cfg.SUPABASE_ANON_KEY || "");

  var session = null;      // { access_token, refresh_token, expires_at, user }
  var listeners = [];
  var refreshing = null;   // in-flight refresh promise, shared by callers

  /* -- Config ----------------------------------------------- */

  function isConfigured() {
    return /^https:\/\/.+/.test(URL_BASE) && ANON_KEY.length > 20;
  }

  /* -- Session storage -------------------------------------- */

  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.access_token && data.refresh_token) return data;
    } catch (err) {
      console.warn("Could not read saved session:", err);
    }
    return null;
  }

  function storeSession(data) {
    session = data;
    try {
      if (data) localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      else localStorage.removeItem(SESSION_KEY);
    } catch (err) {
      console.warn("Could not save session:", err);
    }
    listeners.forEach(function (fn) {
      try { fn(currentUser()); } catch (e) { console.warn(e); }
    });
  }

  // GoTrue returns expires_in (seconds). Convert once, on the way in.
  function shapeSession(payload) {
    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
      user: payload.user
        ? { id: payload.user.id, email: payload.user.email }
        : (session && session.user) || null
    };
  }

  function currentUser() {
    return session && session.user ? session.user : null;
  }

  function isSignedIn() {
    return !!(session && session.access_token && session.user);
  }

  /* -- HTTP ------------------------------------------------- */

  function readError(res, body) {
    var msg =
      (body && (body.error_description || body.msg || body.message || body.error)) ||
      ("HTTP " + res.status);
    var err = new Error(String(msg));
    err.status = res.status;
    err.code = body && (body.error_code || body.code);
    return err;
  }

  function request(path, options) {
    var opts = options || {};
    var headers = {
      apikey: ANON_KEY,
      "Content-Type": "application/json"
    };
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    if (opts.prefer) headers.Prefer = opts.prefer;

    return fetch(URL_BASE + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (raw) {
        var body = null;
        if (raw) { try { body = JSON.parse(raw); } catch (e) { body = { message: raw }; } }
        if (!res.ok) throw readError(res, body);
        return body;
      });
    });
  }

  /* -- Token refresh ---------------------------------------- */

  function refreshSession() {
    if (!session || !session.refresh_token) {
      return Promise.reject(new Error("Not signed in"));
    }
    // Collapse concurrent refreshes - two syncs firing at once must not each
    // spend the (single-use) refresh token.
    if (refreshing) return refreshing;

    refreshing = request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: session.refresh_token }
    }).then(function (payload) {
      storeSession(shapeSession(payload));
      refreshing = null;
      return session;
    }).catch(function (err) {
      refreshing = null;
      // Only a definitively rejected refresh token means the session is dead.
      // A network blip must NOT sign the user out - that would look like the
      // app forgetting them (and would drop unsynced local work).
      if (err.status === 400 || err.status === 401) storeSession(null);
      throw err;
    });

    return refreshing;
  }

  // Every authenticated call goes through here so tokens stay fresh.
  function withToken(fn) {
    if (!isSignedIn()) return Promise.reject(new Error("Not signed in"));

    var fresh = session.expires_at && session.expires_at - Date.now() > REFRESH_MARGIN
      ? Promise.resolve(session)
      : refreshSession();

    return fresh.then(function () {
      return fn(session.access_token);
    }).catch(function (err) {
      // A 401 on the first try means the token died early; refresh once, retry.
      if (err.status !== 401) throw err;
      return refreshSession().then(function () {
        return fn(session.access_token);
      });
    });
  }

  /* -- Auth ------------------------------------------------- */

  function signUp(email, password) {
    return request("/auth/v1/signup", {
      method: "POST",
      body: { email: email, password: password }
    }).then(function (payload) {
      // With "Confirm email" enabled (Supabase default) there is no session
      // yet - the caller shows a "check your inbox" message instead.
      if (payload && payload.access_token) {
        storeSession(shapeSession(payload));
        return { confirmed: true, user: currentUser() };
      }
      return { confirmed: false, user: payload && payload.user ? payload.user : null };
    });
  }

  function signIn(email, password) {
    return request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: email, password: password }
    }).then(function (payload) {
      storeSession(shapeSession(payload));
      return currentUser();
    });
  }

  function sendPasswordReset(email) {
    return request("/auth/v1/recover", {
      method: "POST",
      body: { email: email }
    });
  }

  function signOut() {
    var token = session && session.access_token;
    storeSession(null);   // local first: signing out must work offline too
    if (!token) return Promise.resolve();
    return request("/auth/v1/logout", { method: "POST", token: token })
      .catch(function () { /* already gone server-side; nothing to do */ });
  }

  /* -- Data ------------------------------------------------- */

  function fetchTasks() {
    return withToken(function (token) {
      return request("/rest/v1/tasks?select=*", { token: token });
    });
  }

  function pushTasks(rows) {
    if (!rows.length) return Promise.resolve([]);
    return withToken(function (token) {
      return request("/rest/v1/tasks", {
        method: "POST",
        token: token,
        prefer: "resolution=merge-duplicates,return=minimal",
        body: rows
      });
    });
  }

  function fetchProfile() {
    return withToken(function (token) {
      var uid = encodeURIComponent(currentUser().id);
      return request("/rest/v1/profiles?select=*&user_id=eq." + uid, { token: token })
        .then(function (rows) { return rows && rows.length ? rows[0] : null; });
    });
  }

  function pushProfile(row) {
    return withToken(function (token) {
      return request("/rest/v1/profiles", {
        method: "POST",
        token: token,
        prefer: "resolution=merge-duplicates,return=minimal",
        body: [row]
      });
    });
  }

  /* -- Boot ------------------------------------------------- */

  session = loadSession();

  window.KTT_CLOUD = {
    isConfigured: isConfigured,
    isSignedIn: isSignedIn,
    currentUser: currentUser,
    onChange: function (fn) { listeners.push(fn); },

    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    sendPasswordReset: sendPasswordReset,

    fetchTasks: fetchTasks,
    pushTasks: pushTasks,
    fetchProfile: fetchProfile,
    pushProfile: pushProfile
  };
})();
