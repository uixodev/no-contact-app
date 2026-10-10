# Clear Days: No Contact Tracker (PWA starter kit)

A Progressive Web App built with plain HTML, CSS and JavaScript. You can install it to the home screen on mobile and desktop, and it works fully offline. All check-ins and streaks are saved on the device with **IndexedDB**, so there's no backend, no account and no build step.

## Features
- **Dashboard:** days of No Contact, a ring showing progress to your goal, a bar towards the next milestone, your longest run, check-in streak, average mood and urge over the last 7 check-ins, a 15-week heatmap, milestones and recent entries.
- **Live counter:** the day count is joined by hours, minutes and seconds that tick every second, with an "Every second COUNTS!" reminder. The clock counts from the start of your start date (or last contact day), since only the date is stored.
- **Urgent help:** an "I want to reach out right now" button, shown on the dashboard and offered automatically when you set the urge slider to 8 or more. It opens a calming screen with your live time at stake, your reason, a breathing guide, a 20-minute wait timer, things to do instead, and a shortcut to log the urge.
- **Daily check-in:** choose held or had contact, then add mood (1–5), urge level (0–10) and an optional note. You can edit any past day by clicking it on the heatmap or in the log.
- **Installable:** includes a web app manifest, a custom install button (`beforeinstallprompt`), an iOS "Add to Home Screen" hint, maskable icons and a home-screen shortcut ("Check in today").
- **Offline:** the service worker precaches the app shell, loads pages network-first with a cached fallback, caches fonts with stale-while-revalidate, and shows an "Update ready" prompt when a new version is available.
- **Your data:** export and import backups as JSON, delete everything, and ask the browser for persistent storage (`navigator.storage.persist()`).
- **Light and dark themes**, reduced-motion support, keyboard focus styles and ARIA labels.

## File structure
```
index.html             App shell and dashboard markup
offline.html           Fallback page shown if the app was never cached
manifest.webmanifest   Install metadata (name, icons, colours, shortcuts)
sw.js                  Service worker (precache plus runtime caching)
css/styles.css         Responsive, mobile-first styles and theme tokens
js/db.js               Promise wrapper around IndexedDB (check-ins, settings, backup)
js/streaks.js          Pure date and streak logic (no DOM, easy to unit-test)
js/app.js              UI rendering, events, SW registration, install prompt
icons/                 SVG and PNG icons (192, 512, maskable, Apple touch, favicon)
```

## Run locally
Service workers need `https://` or `localhost`, so opening the file directly won't work.
```bash
cd nc-tracker
python3 -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```
To test offline in Chrome, open DevTools, go to Application > Service Workers and tick "Offline", then reload.

## Data model (IndexedDB `clear-days`, version 1)
| Store | Key | Record |
|---|---|---|
| `checkins` | `date` (`YYYY-MM-DD`, local time) | `{ date, status: 'held'\|'contact', mood, urge, note, createdAt, updatedAt }` |
| `settings` | `key` | `{ key, value }` holding `startDate`, `goal`, `reason` |

Each day has one check-in because the date is the key, so saving again replaces that day's entry.

## How streaks are calculated (`js/streaks.js`)
- **Days of No Contact:** whole days since the start date or the most recent "had contact" check-in, whichever is later.
- **Longest run:** the largest gap between consecutive start or contact events, including the current run.
- **Check-in streak:** consecutive days with any check-in that end today. If you haven't checked in yet today, the streak still counts up to yesterday as a one-day grace period.
- All maths uses local calendar dates converted with `Date.UTC`, so it doesn't drift with timezones or daylight saving.

## Customising
- **Shipping changes:** increase `CACHE_VERSION` in `sw.js` whenever you edit a cached file, otherwise users keep the old version.
- **Milestones:** edit `MILESTONES` in `js/streaks.js`.
- **Urgent help:** change `PEAK_URGE` (default 8) or `WAIT_MS` (default 20 minutes) at the top of `js/app.js`.
- **Colours and fonts:** change the CSS custom properties at the top of `css/styles.css`, and update `theme_color` in the manifest to match.
- **New fields:** add them to the form in `index.html`, read them in `onCheckinSubmit` in `app.js`, and add an `if (event.oldVersion < 2)` migration in `db.js` if you need new stores or indexes.

## Deploying
Upload the folder as-is to any static host with HTTPS, such as GitHub Pages, Netlify, Vercel or Cloudflare Pages. All paths are relative, so it also works from a subfolder.
