/* ============================================================
   Kids Daily Task Tracker
   Plain JS, no build step, no dependencies.
   State lives in localStorage so nothing is lost on refresh.
   ============================================================ */

(function () {
  "use strict";

  /* -- Config ----------------------------------------------- */

  var STORAGE_KEY = "kidsTaskTracker.v1";

  // Stars awarded per priority - harder task, bigger reward.
  var POINTS = { low: 5, medium: 10, high: 15 };

  var PRIORITY_EMOJI = { low: "🟢", medium: "🟡", high: "🔴" };

  var POINTS_PER_LEVEL = 50;

  var LEVEL_NAMES = [
    "Starter",       // level 1
    "Helper",
    "Star Kid",
    "Super Kid",
    "Task Hero",
    "Champion",
    "Legend"
  ];

  var CONFETTI_BITS = ["⭐", "🎉", "🎈", "✨", "🌟", "🎯", "💖"];

  var PRAISE = [
    "Awesome job! 🎉",
    "You did it! ⭐",
    "High five! ✋",
    "Superstar! 🌟",
    "Keep going! 🚀",
    "Amazing! 💖"
  ];

  // Sync tuning
  var SYNC_DEBOUNCE = 900;                        // quiet period before pushing
  var TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000;   // forget deletions after 30 days

  /* -- State ------------------------------------------------ */

  var state = {
    // A task carries updatedAt (last-write-wins key) and deletedAt (soft
    // delete). Soft deletes matter: hard-deleting locally would let another
    // device that still has the task re-upload it, resurrecting it forever.
    tasks: [],          // { id, text, priority, completed, createdAt, completedAt, updatedAt, deletedAt }
    points: 0,          // total stars earned (never goes below 0)
    filter: "all",      // all | pending | completed  (stays local to this device)
    theme: "light",     // light | dark
    profileUpdatedAt: 0 // when points/theme last changed here, for the same LWW rule
  };

  /* -- Elements --------------------------------------------- */

  var el = {
    html: document.documentElement,
    form: document.getElementById("addForm"),
    input: document.getElementById("taskInput"),
    hint: document.getElementById("formHint"),
    list: document.getElementById("taskList"),
    empty: document.getElementById("emptyState"),
    greeting: document.getElementById("greeting"),

    points: document.getElementById("pointsValue"),
    level: document.getElementById("levelValue"),
    levelLabel: document.getElementById("levelLabel"),
    done: document.getElementById("doneValue"),

    progressPct: document.getElementById("progressPct"),
    progressFill: document.getElementById("progressFill"),
    progressBar: document.getElementById("progressBar"),
    progressMsg: document.getElementById("progressMsg"),

    countAll: document.getElementById("countAll"),
    countPending: document.getElementById("countPending"),
    countCompleted: document.getElementById("countCompleted"),

    filters: document.querySelectorAll(".filter"),
    clearDone: document.getElementById("clearDone"),
    resetAll: document.getElementById("resetAll"),
    themeToggle: document.getElementById("themeToggle"),

    toast: document.getElementById("toast"),
    confetti: document.getElementById("confetti"),

    // Cloud / account UI
    syncPill: document.getElementById("syncPill"),
    accountBtn: document.getElementById("accountBtn"),
    accountIcon: document.getElementById("accountIcon"),
    authSheet: document.getElementById("authSheet"),
    authForm: document.getElementById("authForm"),
    authTitle: document.getElementById("authTitle"),
    authIntro: document.getElementById("authIntro"),
    authEmail: document.getElementById("authEmail"),
    authPassword: document.getElementById("authPassword"),
    authError: document.getElementById("authError"),
    authSubmit: document.getElementById("authSubmit"),
    authToggle: document.getElementById("authToggle"),
    authForgot: document.getElementById("authForgot"),
    authClose: document.getElementById("authClose"),
    authAccount: document.getElementById("authAccount"),
    authWho: document.getElementById("authWho"),
    syncNowBtn: document.getElementById("syncNowBtn"),
    signOutBtn: document.getElementById("signOutBtn"),
    footerNote: document.getElementById("footerNote")
  };

  /* -- Storage ---------------------------------------------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tasks: state.tasks,
        points: state.points,
        filter: state.filter,
        theme: state.theme,
        profileUpdatedAt: state.profileUpdatedAt
      }));
    } catch (err) {
      // Private browsing / storage full - the app still works for this session.
      console.warn("Could not save tasks:", err);
    }
  }

  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      console.warn("Could not read saved tasks:", err);
    }
    if (!raw) return;

    var data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.warn("Saved tasks were corrupted, starting fresh.");
      return;
    }
    if (!data || typeof data !== "object") return;

    if (Array.isArray(data.tasks)) {
      var cutoff = Date.now() - TOMBSTONE_TTL;
      state.tasks = data.tasks
        .filter(function (t) { return t && typeof t.text === "string"; })
        .map(function (t) {
          var createdAt = typeof t.createdAt === "number" ? t.createdAt : Date.now();
          return {
            id: typeof t.id === "string" ? t.id : makeId(),
            text: t.text.slice(0, 80),
            priority: POINTS[t.priority] ? t.priority : "medium",
            completed: !!t.completed,
            createdAt: createdAt,
            completedAt: typeof t.completedAt === "number" ? t.completedAt : null,
            // Saves written before sync existed have no updatedAt.
            updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : createdAt,
            deletedAt: typeof t.deletedAt === "number" ? t.deletedAt : null,
            seed: !!t.seed
          };
        })
        // Old tombstones have done their job - every device has seen them.
        .filter(function (t) { return !t.deletedAt || t.deletedAt > cutoff; });
    }
    if (typeof data.points === "number" && isFinite(data.points)) {
      state.points = Math.max(0, Math.round(data.points));
    }
    if (data.filter === "all" || data.filter === "pending" || data.filter === "completed") {
      state.filter = data.filter;
    }
    if (data.theme === "dark" || data.theme === "light") {
      state.theme = data.theme;
    }
    if (typeof data.profileUpdatedAt === "number" && isFinite(data.profileUpdatedAt)) {
      state.profileUpdatedAt = data.profileUpdatedAt;
    }
  }

  /* -- Helpers ---------------------------------------------- */

  function makeId() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Deleted tasks stick around as tombstones for sync, but the app - counts,
  // progress, list - must behave as if they are gone.
  function activeTasks() {
    return state.tasks.filter(function (t) { return !t.deletedAt; });
  }

  // Stamp a task as changed on this device. Every mutation goes through here,
  // otherwise sync cannot tell which side is newer.
  function touch(task) {
    task.updatedAt = Date.now();
    delete task.seed;   // once a user touches an example task it is theirs
    return task;
  }

  function touchProfile() {
    state.profileUpdatedAt = Date.now();
  }

  function toMs(value) {
    var ms = Date.parse(value);
    return isFinite(ms) ? ms : 0;
  }

  function stats() {
    var list = activeTasks();
    var total = list.length;
    var done = 0;
    for (var i = 0; i < total; i++) {
      if (list[i].completed) done++;
    }
    return {
      total: total,
      done: done,
      pending: total - done,
      pct: total === 0 ? 0 : Math.round((done / total) * 100)
    };
  }

  function levelInfo() {
    var level = Math.floor(state.points / POINTS_PER_LEVEL) + 1;
    var name = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)];
    return { level: level, name: name };
  }

  function findTask(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id && !state.tasks[i].deletedAt) return state.tasks[i];
    }
    return null;
  }

  /* -- Rendering -------------------------------------------- */

  function render() {
    renderList();
    renderStats();
  }

  function renderList() {
    var visible = activeTasks().filter(function (t) {
      if (state.filter === "completed") return t.completed;
      if (state.filter === "pending") return !t.completed;
      return true;
    });

    // High priority first, then pending before done, then newest first.
    var weight = { high: 0, medium: 1, low: 2 };
    visible.sort(function (a, b) {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (weight[a.priority] !== weight[b.priority]) return weight[a.priority] - weight[b.priority];
      return b.createdAt - a.createdAt;
    });

    el.list.textContent = "";

    visible.forEach(function (task) {
      el.list.appendChild(taskNode(task));
    });

    var isEmpty = visible.length === 0;
    el.empty.classList.toggle("is-visible", isEmpty);
    if (isEmpty) {
      var titles = {
        all: "No tasks here yet!",
        pending: "Nothing pending – wow!",
        completed: "No finished tasks yet"
      };
      var texts = {
        all: "Type something above and hit Add Task to earn your first stars.",
        pending: "Every task is done. Time to play! 🎮",
        completed: "Tick off a task to see it land here."
      };
      el.empty.querySelector(".empty__title").textContent = titles[state.filter];
      el.empty.querySelector(".empty__text").textContent = texts[state.filter];
      el.empty.querySelector(".empty__emoji").textContent =
        state.filter === "pending" ? "🎉" : state.filter === "completed" ? "📦" : "🦄";
    }
  }

  // Build one task row with DOM APIs (no innerHTML - user text stays text).
  function taskNode(task) {
    var li = document.createElement("li");
    li.className = "task" + (task.completed ? " is-done" : "");
    li.dataset.id = task.id;
    li.dataset.priority = task.priority;

    var check = document.createElement("button");
    check.type = "button";
    check.className = "task__check";
    check.dataset.action = "toggle";
    check.textContent = "✔";
    check.setAttribute("aria-pressed", task.completed ? "true" : "false");
    check.setAttribute("aria-label", (task.completed ? "Mark not done: " : "Mark done: ") + task.text);
    check.title = task.completed ? "Mark as not done" : "Mark as done";

    var body = document.createElement("div");
    body.className = "task__body";

    var text = document.createElement("span");
    text.className = "task__text";
    text.textContent = task.text;

    var meta = document.createElement("div");
    meta.className = "task__meta";

    var badge = document.createElement("span");
    badge.className = "task__badge";
    badge.textContent = PRIORITY_EMOJI[task.priority] + " " + task.priority;

    var stars = document.createElement("span");
    stars.className = "task__stars";
    stars.textContent = (task.completed ? "+" : "") + POINTS[task.priority] + " ⭐";

    meta.appendChild(badge);
    meta.appendChild(stars);
    if (task.completed) {
      var doneTag = document.createElement("span");
      doneTag.textContent = "done 🎉";
      meta.appendChild(doneTag);
    }

    body.appendChild(text);
    body.appendChild(meta);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "task__delete";
    del.dataset.action = "delete";
    del.textContent = "🗑️";
    del.setAttribute("aria-label", "Delete task: " + task.text);
    del.title = "Delete task";

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(del);
    return li;
  }

  function renderStats() {
    var s = stats();
    var lv = levelInfo();

    el.points.textContent = String(state.points);
    el.level.textContent = String(lv.level);
    el.levelLabel.textContent = lv.name;
    el.done.textContent = s.done + "/" + s.total;

    el.progressPct.textContent = s.pct + "%";
    el.progressFill.style.width = s.pct + "%";
    el.progressFill.dataset.showRunner = s.pct > 8 ? "1" : "0";
    el.progressBar.setAttribute("aria-valuenow", String(s.pct));

    el.countAll.textContent = String(s.total);
    el.countPending.textContent = String(s.pending);
    el.countCompleted.textContent = String(s.done);

    el.clearDone.hidden = s.done === 0;

    el.progressMsg.textContent = progressMessage(s);
    el.greeting.textContent = s.pending > 0
      ? "You have " + s.pending + (s.pending === 1 ? " task" : " tasks") + " to go. You can do it!"
      : "Let's get things done today!";
  }

  function progressMessage(s) {
    if (s.total === 0) return "Add your first task to begin! 🎈";
    if (s.pct === 100) return "All done! You are a superstar today! 🏆";
    if (s.pct >= 75) return "Almost there - just a little more! 💪";
    if (s.pct >= 50) return "Halfway done. Great work! 🌟";
    if (s.pct > 0) return "Nice start - keep it up! 🚀";
    return "Tap a circle to tick off your first task. ✅";
  }

  /* -- Feedback (toast + confetti) -------------------------- */

  var toastTimer = null;

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove("is-visible");
    }, 2200);
  }

  function confetti(count) {
    var n = count || 24;
    for (var i = 0; i < n; i++) {
      var bit = document.createElement("span");
      bit.className = "confetti__bit";
      bit.textContent = pick(CONFETTI_BITS);
      bit.style.left = Math.random() * 100 + "vw";
      bit.style.animationDuration = (1.6 + Math.random() * 1.4).toFixed(2) + "s";
      bit.style.animationDelay = (Math.random() * 0.4).toFixed(2) + "s";
      bit.style.fontSize = (0.9 + Math.random() * 1.2).toFixed(2) + "rem";
      el.confetti.appendChild(bit);
      bit.addEventListener("animationend", function () { this.remove(); });
    }
  }

  function bump(card) {
    card.classList.remove("is-bumped");
    void card.offsetWidth; // restart the animation
    card.classList.add("is-bumped");
  }

  /* -- Actions ---------------------------------------------- */

  function addTask(text, priority) {
    var now = Date.now();
    state.tasks.push({
      id: makeId(),
      text: text,
      priority: priority,
      completed: false,
      createdAt: now,
      completedAt: null,
      updatedAt: now,
      deletedAt: null
    });
    save();
    scheduleSync();
    render();
    toast("Task added! " + PRIORITY_EMOJI[priority] + " Worth " + POINTS[priority] + " stars");
  }

  function toggleTask(id) {
    var task = findTask(id);
    if (!task) return;

    var wasAllDone = stats().pct === 100;
    var oldLevel = levelInfo().level;

    task.completed = !task.completed;
    task.completedAt = task.completed ? Date.now() : null;
    touch(task);

    var earned = POINTS[task.priority];
    if (task.completed) {
      state.points += earned;
    } else {
      state.points = Math.max(0, state.points - earned);
    }
    touchProfile();

    save();
    scheduleSync();
    render();
    bump(el.points.closest(".score-card"));

    if (task.completed) {
      var s = stats();
      var newLevel = levelInfo().level;

      if (s.total > 0 && s.pct === 100 && !wasAllDone) {
        confetti(48);
        toast("Every task done! +" + earned + " stars 🏆");
      } else if (newLevel > oldLevel) {
        confetti(40);
        toast("Level " + newLevel + " - " + levelInfo().name + "! 🏆");
      } else {
        confetti(16);
        toast(pick(PRAISE) + " +" + earned + " stars");
      }
    } else {
      toast("Task reopened - " + earned + " stars removed");
    }
  }

  function deleteTask(id, row) {
    var task = findTask(id);
    if (!task) return;

    // Completed tasks give their stars back when removed, so points stay honest.
    if (task.completed) {
      state.points = Math.max(0, state.points - POINTS[task.priority]);
      touchProfile();
    }

    // Soft delete: the row stays as a tombstone so the deletion reaches every
    // other device instead of being undone by one that still has the task.
    task.deletedAt = Date.now();
    touch(task);
    save();
    scheduleSync();

    if (row) {
      row.classList.add("is-leaving");
      setTimeout(render, 240);
    } else {
      render();
    }
    toast("Task deleted 🗑️");
  }

  function clearCompleted() {
    var done = activeTasks().filter(function (t) { return t.completed; });
    if (done.length === 0) return;

    // Clearing tidies the list but keeps the stars already earned.
    done.forEach(function (t) {
      t.deletedAt = Date.now();
      touch(t);
    });
    save();
    scheduleSync();
    render();
    toast("Cleared " + done.length + (done.length === 1 ? " task" : " tasks") + " - stars kept! ⭐");
  }

  function resetEverything() {
    var warning = signedIn()
      ? "Delete all tasks and reset your stars to zero? This clears them on every device you are signed in on."
      : "Delete all tasks and reset your stars back to zero?";
    if (!window.confirm(warning)) return;

    // Tombstone rather than drop, so the reset propagates instead of the
    // tasks flowing straight back down on the next sync.
    activeTasks().forEach(function (t) {
      t.deletedAt = Date.now();
      touch(t);
    });
    state.points = 0;
    state.filter = "all";
    touchProfile();
    save();
    scheduleSync();
    syncFilterButtons();
    render();
    toast("Fresh start! 🌟");
  }

  function setFilter(name) {
    state.filter = name;
    save();
    syncFilterButtons();
    renderList();
  }

  function syncFilterButtons() {
    for (var i = 0; i < el.filters.length; i++) {
      var btn = el.filters[i];
      var active = btn.dataset.filter === state.filter;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  function applyTheme() {
    var dark = state.theme === "dark";
    el.html.setAttribute("data-theme", state.theme);
    el.themeToggle.querySelector(".theme-btn__icon").textContent = dark ? "☀️" : "🌙";
    el.themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    el.themeToggle.title = dark ? "Light mode" : "Dark mode";
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    touchProfile();
    applyTheme();
    save();
    scheduleSync();
    toast(state.theme === "dark" ? "Dark mode on 🌙" : "Light mode on ☀️");
  }

  /* -- Cloud sync -------------------------------------------- */

  var cloud = window.KTT_CLOUD || null;
  var syncTimer = null;
  var syncing = false;
  var syncQueued = false;

  function cloudReady() {
    return !!(cloud && cloud.isConfigured());
  }

  function signedIn() {
    return cloudReady() && cloud.isSignedIn();
  }

  function setSyncStatus(kind, text) {
    if (!el.syncPill) return;
    if (!kind) { el.syncPill.hidden = true; return; }
    el.syncPill.hidden = false;
    el.syncPill.textContent = text;
    el.syncPill.className = "sync-pill sync-pill--" + kind;
  }

  // Mutations call this instead of syncing immediately - ticking off five
  // tasks in a row should be one upload, not five.
  function scheduleSync() {
    if (!signedIn()) return;
    setSyncStatus("pending", "Saving…");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, SYNC_DEBOUNCE);
  }

  function rowFromTask(t) {
    return {
      user_id: cloud.currentUser().id,
      id: t.id,
      text: t.text,
      priority: t.priority,
      completed: !!t.completed,
      created_at: new Date(t.createdAt).toISOString(),
      completed_at: t.completedAt ? new Date(t.completedAt).toISOString() : null,
      deleted_at: t.deletedAt ? new Date(t.deletedAt).toISOString() : null,
      updated_at: new Date(t.updatedAt).toISOString()
    };
  }

  function taskFromRow(r) {
    var createdAt = toMs(r.created_at) || Date.now();
    return {
      id: String(r.id),
      text: String(r.text || "").slice(0, 80),
      priority: POINTS[r.priority] ? r.priority : "medium",
      completed: !!r.completed,
      createdAt: createdAt,
      completedAt: r.completed_at ? toMs(r.completed_at) : null,
      deletedAt: r.deleted_at ? toMs(r.deleted_at) : null,
      updatedAt: toMs(r.updated_at) || createdAt
    };
  }

  // Merge remote rows into local state, newest write winning per task, and
  // return the rows that need uploading.
  function mergeTasks(remoteRows) {
    // A fresh browser seeds four example tasks. If this account already has
    // real tasks, those examples are noise - drop them rather than upload.
    if (remoteRows.length) {
      state.tasks = state.tasks.filter(function (t) { return !t.seed; });
    }

    var localById = {};
    state.tasks.forEach(function (t) { localById[t.id] = t; });

    var remoteIds = {};
    var toPush = [];

    remoteRows.forEach(function (row) {
      var remote = taskFromRow(row);
      remoteIds[remote.id] = true;
      var local = localById[remote.id];

      if (!local) {
        state.tasks.push(remote);
      } else if (remote.updatedAt > local.updatedAt) {
        local.text = remote.text;
        local.priority = remote.priority;
        local.completed = remote.completed;
        local.createdAt = remote.createdAt;
        local.completedAt = remote.completedAt;
        local.deletedAt = remote.deletedAt;
        local.updatedAt = remote.updatedAt;
        delete local.seed;
      } else if (local.updatedAt > remote.updatedAt) {
        toPush.push(rowFromTask(local));
      }
    });

    // Anything the server has never seen.
    state.tasks.forEach(function (t) {
      if (!remoteIds[t.id]) toPush.push(rowFromTask(t));
    });

    return toPush;
  }

  // Points and theme live on one profile row, same last-write-wins rule.
  // Returns the row to upload, or null when the server copy is newer.
  function mergeProfile(remote) {
    var uid = cloud.currentUser().id;
    var mine = {
      user_id: uid,
      points: state.points,
      theme: state.theme,
      updated_at: new Date(state.profileUpdatedAt || Date.now()).toISOString()
    };

    if (!remote) return mine;               // first sync for this account

    var remoteAt = toMs(remote.updated_at);
    if (remoteAt > state.profileUpdatedAt) {
      state.points = Math.max(0, Math.round(Number(remote.points) || 0));
      if (remote.theme === "dark" || remote.theme === "light") state.theme = remote.theme;
      state.profileUpdatedAt = remoteAt;
      return null;
    }
    return state.profileUpdatedAt > remoteAt ? mine : null;
  }

  // Resolves true when everything is safely uploaded, false otherwise.
  function syncNow() {
    if (!signedIn()) return Promise.resolve(false);
    if (syncing) { syncQueued = true; return Promise.resolve(false); }

    syncing = true;
    clearTimeout(syncTimer);
    setSyncStatus("busy", "Syncing…");

    return Promise.all([cloud.fetchTasks(), cloud.fetchProfile()])
      .then(function (results) {
        var toPush = mergeTasks(results[0] || []);
        var profileRow = mergeProfile(results[1]);

        save();
        applyTheme();
        render();

        var jobs = [];
        if (toPush.length) jobs.push(cloud.pushTasks(toPush));
        if (profileRow) jobs.push(cloud.pushProfile(profileRow));
        return Promise.all(jobs);
      })
      .then(function () {
        syncing = false;
        setSyncStatus("ok", "Synced ✓");
        if (syncQueued) { syncQueued = false; scheduleSync(); }
        return true;
      })
      .catch(function (err) {
        syncing = false;
        console.warn("Sync failed:", err);
        // Local data is untouched - the next sync retries from where we are.
        if (!navigator.onLine) setSyncStatus("error", "Offline");
        else if (!cloud.isSignedIn()) { renderAccount(); setSyncStatus("error", "Sign in again"); }
        else setSyncStatus("error", "Sync failed");
        return false;
      });
  }

  /* -- Account UI -------------------------------------------- */

  var authMode = "signin";   // signin | signup

  function renderAccount() {
    if (!cloudReady()) {
      // No Supabase details configured: stay a local-only app.
      if (el.accountBtn) el.accountBtn.hidden = true;
      setSyncStatus(null);
      return;
    }

    el.accountBtn.hidden = false;
    var user = cloud.currentUser();

    if (user) {
      el.accountIcon.textContent = (user.email || "?").charAt(0).toUpperCase();
      el.accountBtn.setAttribute("aria-label", "Account: " + user.email);
      el.accountBtn.title = "Signed in as " + user.email;
      el.accountBtn.classList.add("is-signed-in");
      el.footerNote.textContent = "Made with 💜 — synced to your account.";
    } else {
      el.footerNote.textContent = "Made with 💜 — your tasks are saved on this device.";
      el.accountIcon.textContent = "☁️";
      el.accountBtn.setAttribute("aria-label", "Sign in to sync your tasks");
      el.accountBtn.title = "Sign in to sync";
      el.accountBtn.classList.remove("is-signed-in");
      setSyncStatus(null);
    }
  }

  function setAuthMode(mode) {
    authMode = mode;
    var signup = mode === "signup";
    el.authTitle.textContent = signup ? "Create an account ☁️" : "Sign in to sync ☁️";
    el.authIntro.textContent = signup
      ? "Pick an email and password. Your stars will then follow you to any device."
      : "Your tasks and stars will follow you to any device.";
    el.authSubmit.textContent = signup ? "Create account" : "Sign in";
    el.authToggle.textContent = signup
      ? "Already have an account? Sign in"
      : "New here? Create an account";
    el.authPassword.setAttribute("autocomplete", signup ? "new-password" : "current-password");
    el.authForgot.hidden = signup;
    setAuthMessage("");
  }

  function setAuthMessage(text, kind) {
    el.authError.textContent = text || "";
    el.authError.className = "sheet__message" + (kind ? " sheet__message--" + kind : "");
  }

  function friendlyAuthError(err) {
    var msg = String((err && err.message) || "Something went wrong");
    if (/invalid login credentials/i.test(msg)) return "That email and password don't match. Try again?";
    if (/already registered|already been registered/i.test(msg)) return "That email already has an account - sign in instead.";
    if (/email not confirmed/i.test(msg)) return "Check your inbox and confirm your email first.";
    if (/password should be at least/i.test(msg)) return "Password needs to be at least 6 characters.";
    if (/rate limit|too many/i.test(msg)) return "Too many tries. Wait a minute and try again.";
    if (/failed to fetch|networkerror/i.test(msg)) return "No connection right now. Try again in a moment.";
    return msg;
  }

  function openAuth() {
    var user = cloud.currentUser();
    el.authForm.hidden = !!user;
    el.authAccount.hidden = !user;
    if (user) {
      el.authWho.textContent = user.email || "your account";
    } else {
      setAuthMode(authMode);
      el.authPassword.value = "";
    }
    if (typeof el.authSheet.showModal === "function") el.authSheet.showModal();
    else el.authSheet.setAttribute("open", "");
    if (!user) el.authEmail.focus();
  }

  function closeAuth() {
    if (typeof el.authSheet.close === "function") el.authSheet.close();
    else el.authSheet.removeAttribute("open");
  }

  function submitAuth(event) {
    event.preventDefault();
    var email = el.authEmail.value.trim();
    var password = el.authPassword.value;

    if (!email || password.length < 6) {
      setAuthMessage("Enter your email and a password of at least 6 characters.", "error");
      return;
    }

    el.authSubmit.disabled = true;
    setAuthMessage(authMode === "signup" ? "Creating your account…" : "Signing in…");

    var op = authMode === "signup"
      ? cloud.signUp(email, password)
      : cloud.signIn(email, password);

    op.then(function (result) {
      el.authSubmit.disabled = false;

      // Supabase confirms email addresses by default, so a new account has
      // no session yet - the user has to click the link first.
      if (authMode === "signup" && result && result.confirmed === false) {
        setAuthMode("signin");
        setAuthMessage("Check " + email + " for a confirmation link, then sign in.", "ok");
        return null;
      }

      el.authPassword.value = "";
      closeAuth();
      renderAccount();
      toast("Signed in - syncing your tasks ☁️");
      return syncNow();
    }).catch(function (err) {
      el.authSubmit.disabled = false;
      setAuthMessage(friendlyAuthError(err), "error");
    });
  }

  function forgotPassword() {
    var email = el.authEmail.value.trim();
    if (!email) {
      setAuthMessage("Type your email first, then tap this again.", "error");
      el.authEmail.focus();
      return;
    }
    setAuthMessage("Sending a reset link…");
    cloud.sendPasswordReset(email)
      .then(function () { setAuthMessage("Reset link sent to " + email + ".", "ok"); })
      .catch(function (err) { setAuthMessage(friendlyAuthError(err), "error"); });
  }

  function finishSignOut() {
    return cloud.signOut().then(function () {
      // The account keeps the data. Clearing it locally matters on a shared
      // device: the next person to sign in must not inherit these tasks.
      state.tasks = [];
      state.points = 0;
      state.profileUpdatedAt = 0;
      save();
      closeAuth();
      renderAccount();
      setSyncStatus(null);
      render();
      toast("Signed out - your tasks are safe in your account 👋");
    });
  }

  function doSignOut() {
    if (!navigator.onLine) {
      if (!window.confirm("You are offline, so recent changes may not have reached your account yet. Sign out anyway?")) return;
      finishSignOut();
      return;
    }
    // Flush pending changes first - signing out drops the local copy.
    syncNow().then(function (ok) {
      if (ok || window.confirm("Some changes could not be synced. Sign out anyway?")) finishSignOut();
    });
  }

  /* -- Events ----------------------------------------------- */

  el.form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = el.input.value.trim();

    if (!text) {
      el.hint.textContent = "Please write a task first ✍️";
      el.input.focus();
      return;
    }

    var checked = el.form.querySelector('input[name="priority"]:checked');
    var priority = checked ? checked.value : "medium";

    el.hint.textContent = "";
    el.input.value = "";
    addTask(text, priority);
    el.input.focus();
  });

  el.input.addEventListener("input", function () {
    if (el.hint.textContent) el.hint.textContent = "";
  });

  // One listener for the whole list - works for rows added later too.
  el.list.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-action]");
    if (!btn) return;
    var row = btn.closest(".task");
    if (!row) return;

    if (btn.dataset.action === "toggle") toggleTask(row.dataset.id);
    if (btn.dataset.action === "delete") deleteTask(row.dataset.id, row);
  });

  for (var i = 0; i < el.filters.length; i++) {
    el.filters[i].addEventListener("click", function () {
      setFilter(this.dataset.filter);
    });
  }

  el.clearDone.addEventListener("click", clearCompleted);
  el.resetAll.addEventListener("click", resetEverything);
  el.themeToggle.addEventListener("click", toggleTheme);

  // Account sheet
  el.accountBtn.addEventListener("click", openAuth);
  el.authForm.addEventListener("submit", submitAuth);
  el.authToggle.addEventListener("click", function () {
    setAuthMode(authMode === "signup" ? "signin" : "signup");
  });
  el.authForgot.addEventListener("click", forgotPassword);
  el.authClose.addEventListener("click", closeAuth);
  el.signOutBtn.addEventListener("click", doSignOut);
  el.syncNowBtn.addEventListener("click", function () {
    syncNow().then(function (ok) {
      toast(ok ? "Everything is synced ✓" : "Could not sync right now - will retry");
    });
  });

  // Coming back online, or returning to the tab, is the moment another
  // device's changes are most likely waiting.
  window.addEventListener("online", function () { if (signedIn()) syncNow(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && signedIn()) syncNow();
  });

  // Keep tabs in sync if the site is open twice on the same device.
  window.addEventListener("storage", function (event) {
    if (event.key !== STORAGE_KEY) return;
    load();
    applyTheme();
    syncFilterButtons();
    render();
  });

  /* -- Start ------------------------------------------------ */

  load();

  // First visit with no saved data: seed a few friendly examples. A signed-in
  // device skips this - its tasks arrive from the account instead.
  if (state.tasks.length === 0 && state.points === 0 && !signedIn()) {
    var seeds = [
      { text: "Brush my teeth 🦷", priority: "high" },
      { text: "Do my homework 📚", priority: "high" },
      { text: "Tidy up my room 🧸", priority: "medium" },
      { text: "Read for 10 minutes 📖", priority: "low" }
    ];
    seeds.forEach(function (seed, index) {
      var created = Date.now() - (seeds.length - index) * 1000;
      state.tasks.push({
        id: makeId() + index,
        text: seed.text,
        priority: seed.priority,
        completed: false,
        createdAt: created,
        completedAt: null,
        updatedAt: created,
        deletedAt: null,
        seed: true      // flagged so a real account's tasks replace them
      });
    });
    save();
  }

  applyTheme();
  syncFilterButtons();
  render();

  if (cloudReady()) {
    renderAccount();
    cloud.onChange(renderAccount);
    if (signedIn()) syncNow();
  } else if (el.accountBtn) {
    el.accountBtn.hidden = true;
  }
})();
