# ⭐ Kids Daily Task Tracker

A colorful, mobile-friendly daily task tracker for kids. Plain HTML + CSS + JavaScript —
no build step, no dependencies, no internet needed (the web font is the only optional extra).

## Run it

Just double-click `index.html`, or serve the folder:

```bash
npx http-server C:/Users/QK/kids-task-tracker -p 5601 -c-1
```

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | Colors, layout, animations, light + dark themes |
| `script.js` | All the behaviour and `localStorage` saving |
| `_headers` | Cloudflare Pages cache + security headers |

## Deploying (Cloudflare Pages)

The site is static, so there is no build step.

1. In the [Cloudflare dashboard](https://dash.cloudflare.com) go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the `kids-task-tracker` repo.
3. Settings: **Framework preset** `None`, **Build command** *(empty)*, **Build output directory** `/`.
4. Save and deploy. Every push to `main` deploys automatically, and other branches get preview URLs.

## Roadmap (Supabase)

Currently everything is local to the browser. Next step is a Supabase project for
accounts and cross-device sync — the storage layer in `script.js` (`save()` / `load()`)
is the only place that needs to change.

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
