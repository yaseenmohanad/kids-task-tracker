# ⭐ Kids Daily Task Tracker

A colorful, mobile-friendly daily task tracker for kids. Plain HTML + CSS + JavaScript —
no build step, no dependencies, no internet needed (the web font is the only optional extra).

## Run it

Just double-click `public/index.html`, or serve the folder:

```bash
npx http-server public -p 5601 -c-1
```

## Files

| File | What's in it |
| --- | --- |
| `public/index.html` | Page structure |
| `public/styles.css` | Colors, layout, animations, light + dark themes |
| `public/script.js` | The app: tasks, points, rendering, `localStorage`, sync/merge rules |
| `public/cloud.js` | Supabase auth + REST over plain `fetch` (no dependencies) |
| `public/config.js` | Your Supabase URL + anon key |
| `public/_headers` | Cache + security headers served by Cloudflare |
| `wrangler.jsonc` | Cloudflare config — a static-assets-only Worker serving `public/` |
| `supabase/migration_001_sync.sql` | Tables, RLS policies and the profile trigger |

## Deploying (Cloudflare Workers)

There is no build step: `wrangler deploy` uploads `public/` to Cloudflare's edge as
static assets. No worker script exists yet, so nothing runs server-side.

Deploys happen automatically through **Workers Builds** — the dashboard is connected to
this GitHub repo, and every push to `main` triggers a deploy. Dashboard build settings
(Workers → kids-task-tracker → Settings → Builds):

- **Build command:** *(empty)*
- **Deploy command:** `npx wrangler deploy`
- **Root directory:** `/`

To deploy by hand instead:

```bash
npx wrangler login
npm run deploy
```

Check the config without deploying anything:

```bash
npx wrangler deploy --dry-run
```

## Cross-device sync (Supabase)

Sign in and the same tasks, stars and theme appear on every device. Signed out, the app
is unchanged: everything stays in `localStorage` and the sign-in button is hidden.

### Setup

1. Create a Supabase project.
2. **SQL Editor → New query** → paste `supabase/migration_001_sync.sql` → **Run**.
   The last statement should report `rowsecurity = true` for both tables.
3. Copy **Project URL** and the **anon / public** key from Project Settings, and put them
   in `public/config.js`.
4. Commit and push. Cloudflare redeploys, and the ☁️ button appears in the header.

Both values in `config.js` are public by design — the anon key is meant to ship in
client code, and every request it makes is still checked against the RLS policies.
**Never put the `service_role` key in this repo**: it bypasses RLS entirely.

Supabase confirms email addresses by default, so a new account has to click the link in
its inbox before the first sign-in. To skip that for family use:
**Authentication → Sign In / Providers → Email → turn off "Confirm email"**.

### How sync works

- **Last write wins, per task.** Every change stamps `updated_at` on the device that made
  it. On sync, whichever side is newer for that task wins. There is no locking and no
  merge prompt — for one family's chore list, newest-wins is the honest model.
- **Deletes are soft.** A deleted task keeps its row with `deleted_at` set, hidden from
  the UI. A hard delete would let another device that still has the task upload it again,
  resurrecting it forever. Tombstones older than 30 days are pruned locally.
- **Points and theme** live on one `profiles` row under the same rule. Points are stored
  rather than recalculated because "Clear done" removes finished tasks but keeps the stars.
- **Sync is debounced** (~0.9s), so ticking off five tasks is one upload. It also runs on
  sign-in, on coming back online, and when you return to the tab.
- **Failures are safe.** A failed sync never touches local data; the pill shows
  `Sync failed` / `Offline` and the next attempt picks up where it left off. A network
  error does *not* sign you out — only a definitively rejected refresh token does.
- **Example tasks never pollute an account.** The four starter tasks are flagged as
  examples and dropped on first sync if the account already has real tasks.
- **Signing out clears the local copy** (it is safely in the account). That matters on a
  shared device: the next person to sign in must not inherit someone else's tasks. If a
  sync is still pending, it flushes first and warns if it can't.

### Not covered yet

Realtime push (changes appear on the next sync, not instantly), multiple kid profiles
under one parent account, streaks, and a rewards store.

## Features

- **Add tasks** with a priority: 🟢 Low, 🟡 Medium, 🔴 High (colored left border per priority)
- **Tick tasks off** with the round check button; tick again to reopen
- **Delete tasks** with the 🗑️ button
- **Filters**: All / Pending / Completed, each with a live count
- **Progress bar + percentage** with an encouraging message that changes as you go
- **Points**: Low = 5 ⭐, Medium = 10 ⭐, High = 15 ⭐
- **Levels**: every 50 points is a new level — Starter → Helper → Star Kid → Super Kid →
  Task Hero → Champion → Legend
- **Rewards**: confetti + a toast on every completed task, extra confetti on a level up
  and when everything is done
- **Dark mode** 🌙 toggle in the top-right, remembered between visits
- **Saved automatically** — tasks, points, chosen filter and theme all survive a refresh
- **Mobile-friendly** — single column, 44px+ tap targets, safe-area padding
- **Clear done** tidies finished tasks but keeps the stars you earned;
  **Reset everything** wipes tasks and points (with a confirmation)

## Notes

- Data is stored in `localStorage` under the key `kidsTaskTracker.v1`, so it is per-browser
  and per-device — nothing is uploaded anywhere.
- Deleting a *completed* task takes its stars back, so the points total always matches
  the tasks that are actually ticked off.
- First visit seeds four example tasks (brush teeth, homework, tidy room, read) so the page
  is never empty; delete them and add your own.
- Task text is inserted with `textContent`, never `innerHTML` — typed text can't inject markup.
- Animations respect `prefers-reduced-motion`.
