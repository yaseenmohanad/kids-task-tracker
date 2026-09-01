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

  /* -- State ------------------------------------------------ */

  var state = {
    tasks: [],          // { id, text, priority, completed, createdAt, completedAt }
    points: 0,          // total stars earned (never goes below 0)
    filter: "all",      // all | pending | completed
    theme: "light"      // light | dark
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
    confetti: document.getElementById("confetti")
  };

  /* -- Storage ---------------------------------------------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tasks: state.tasks,
        points: state.points,
        filter: state.filter,
        theme: state.theme
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
      state.tasks = data.tasks
        .filter(function (t) { return t && typeof t.text === "string"; })
        .map(function (t) {
          return {
            id: typeof t.id === "string" ? t.id : makeId(),
            text: t.text.slice(0, 80),
            priority: POINTS[t.priority] ? t.priority : "medium",
            completed: !!t.completed,
            createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
            completedAt: typeof t.completedAt === "number" ? t.completedAt : null
          };
        });
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
  }

  /* -- Helpers ---------------------------------------------- */

  function makeId() {
    return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function stats() {
    var total = state.tasks.length;
    var done = 0;
    for (var i = 0; i < total; i++) {
      if (state.tasks[i].completed) done++;
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
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  /* -- Rendering -------------------------------------------- */

  function render() {
    renderList();
    renderStats();
  }

  function renderList() {
    var visible = state.tasks.filter(function (t) {
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
    state.tasks.push({
      id: makeId(),
      text: text,
      priority: priority,
      completed: false,
      createdAt: Date.now(),
      completedAt: null
    });
    save();
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

    var earned = POINTS[task.priority];
    if (task.completed) {
      state.points += earned;
    } else {
      state.points = Math.max(0, state.points - earned);
    }

    save();
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
    }

    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    save();

    if (row) {
      row.classList.add("is-leaving");
      setTimeout(render, 240);
    } else {
      render();
    }
    toast("Task deleted 🗑️");
  }

  function clearCompleted() {
    var done = state.tasks.filter(function (t) { return t.completed; });
    if (done.length === 0) return;

    // Clearing tidies the list but keeps the stars already earned.
    state.tasks = state.tasks.filter(function (t) { return !t.completed; });
    save();
    render();
    toast("Cleared " + done.length + (done.length === 1 ? " task" : " tasks") + " - stars kept! ⭐");
  }

  function resetEverything() {
    if (!window.confirm("Delete all tasks and reset your stars back to zero?")) return;
    state.tasks = [];
    state.points = 0;
    state.filter = "all";
    save();
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
    applyTheme();
    save();
    toast(state.theme === "dark" ? "Dark mode on 🌙" : "Light mode on ☀️");
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

  // First visit with no saved data: seed a few friendly examples.
  if (state.tasks.length === 0 && state.points === 0) {
    var seeds = [
      { text: "Brush my teeth 🦷", priority: "high" },
      { text: "Do my homework 📚", priority: "high" },
      { text: "Tidy up my room 🧸", priority: "medium" },
      { text: "Read for 10 minutes 📖", priority: "low" }
    ];
    seeds.forEach(function (seed, index) {
      state.tasks.push({
        id: makeId() + index,
        text: seed.text,
        priority: seed.priority,
        completed: false,
        createdAt: Date.now() - (seeds.length - index) * 1000,
        completedAt: null
      });
    });
    save();
  }

  applyTheme();
  syncFilterButtons();
  render();
})();
