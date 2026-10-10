# No Contact Dude: No Contact Tracker (PWA)

A Progressive Web App built with plain HTML, CSS and JavaScript. You can install it to the home screen on mobile and desktop, and it works fully offline. All check-ins and streaks are saved on the device with **IndexedDB**, so there's no backend, no account and no build step.

## Features
- **App-style sections:** a bottom menu splits the app into **Home** (the calm orb and today's status), **Check-in** (see the next item, with a red dot on its tab until you've checked in), **Progress** (stats, heatmap and milestones) and **Help** (urgent help, quick tools, urges survived). Sections have their own addresses (`#home`, `#checkin`, `#progress`, `#help`), so the browser's Back button works. The install shortcuts open "Check in today" and "I need help now" (`?action=checkin`, `?action=urgent`).
- **Check-in:** a 7-day strip (tap a day to open it) with your streak, a daily goal (check in, log 3 wins, write one good thing) that celebrates when you finish it, and today's form with a one-tap "Quick save: I held today". The form has optional sections: what triggered you, wins (10 small self-care wins), sleep and energy, and a reflection (one good thing, "Tomorrow I will…", a note with writing prompts). "Your patterns" shows your hardest day, best mood day, top trigger, average sleep and wins, plus separate mood and urge charts (hover, tap or use the keyboard for values; a table view is one tap away). The note box is tall and grows as you write (up to 2,000 characters). Recent entries can be filtered (All, Held, Contact, With notes) and paged, and tapping one opens a full reading view: the whole note first, then mood, urge, triggers, wins, sleep, your good thing and tomorrow's plan, with Newer/Older buttons (or the arrow keys) to page through entries and Edit and Delete buttons, and a "Daily reminder" button downloads a repeating calendar event (`.ics`) at the time you choose.
- **Loading screen and logo:** the dude (our sprout in sunglasses) drops his shades on, the name rises word by word, and a soft teal sky with ripples and drifting lights plays behind a loading bar. It shows for about 1.7 seconds on launch and is skipped on reloads in the same session. The app icon is the dude with a small "no phone" badge.
- **Calm centrepiece:** days sit inside a slowly breathing orb with a progress ring towards your goal, water-like ripples, drifting lights, and a glowing bead that circles once a minute like a seconds hand. Underneath are live hours, minutes and seconds, a running count of "seconds of peace", and "Every second COUNTS!". Motion stops if you've asked your device for reduced motion.
- **Exact time:** set the date *and time* you last spoke (onboarding or Settings). The counter runs from that exact moment, and a "had contact" check-in can carry its own time so a slip restarts the count from the real moment.
- **Duolingo-style design:** chunky 3D buttons, option cards, emoji moods, a friendly sprout mascot, medals for milestones, and light and dark themes. The scroll bar is hidden on phones.
- **Dashboard:** your check-in streak in the top bar, longest run, average mood and urge over the last 7 check-ins, a 15-week heatmap, milestones and recent entries.
- **Urgent help (at the very end of the page):** an "I want to reach out right now" button, also offered automatically when you set the urge slider to 8 or more. It opens a guided, full-screen, seven-step rescue led by the mascot, with a progress bar and a Continue button pinned at the bottom: (1) rate how strong the urge is and tag what's pulling at you, (2) three rounds of guided 4-4-6 breathing, (3) a tap-along 5-4-3-2-1 grounding exercise, (4) tap-to-reveal reality-check cards showing your own reason and your live time held, (5) write what you want to say and "let it go" (it is never saved or sent), (6) pick an activity and run a 5, 10 or 20 minute wave timer, with one-tap Text and Call buttons for a trusted person, and (7) rate the urge again to see how far it dropped, with confetti. Finishing records the urge, which feeds the "Urges survived" and "Average relief" stats.
- **Daily check-in:** choose held or had contact, then add mood (1–5), urge level (0–10) and an optional note. You can edit any past day by clicking it on the heatmap or in the log. Editing opens the entry in a pop-up window (full-screen on phones) with a sticky Save bar; closing it asks before discarding changes and returns you to the entry you were reading. Picking "Something else" under triggers reveals a short text box so you can write what it was in your own words.
- **Installable:** includes a web app manifest, a custom install button (`beforeinstallprompt`), an iOS "Add to Home Screen" hint, maskable icons and a home-screen shortcut ("Check in today").
- **Candles:** the "Your days" pop-up also has a Candles tab: light a candle for each day (or "Light all"), and when every candle is lit the whole room glows.
- **Your days:** tap the big circle on Home to open a pop-up with one balloon per day of no contact (up to 90, grouped beyond that). Pop them for a short note about each day, and pop them all for a celebration. A second tab shows the 60 seconds of the current minute filling in live, plus your running total of seconds of peace.
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
js/streaks.js          Pure date, streak and urge-stats logic (no DOM, easy to unit-test)
js/app.js              UI rendering, events, SW registration, install prompt
js/rescue.js           The guided urgent-help flow (seven steps, wave timer, breathing)
js/tags.js             Shared lists: triggers, wins, sleep, energy, writing prompts
js/charts.js           A tiny SVG line-chart builder (used by Your patterns)
js/fx.js               Confetti, shared by urgent help and the daily goal
icons/                 The dude icon as SVG and PNG (192, 512, maskable, Apple touch, favicon)
```

## Run locally
Service workers need `https://` or `localhost`, so opening the file directly won't work.
```bash
cd nc-tracker
python3 -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```
To test offline in Chrome, open DevTools, go to Application > Service Workers and tick "Offline", then reload.

## Data model (IndexedDB `clear-days`, version 2)
| Store | Key | Record |
|---|---|---|
| `checkins` | `date` (`YYYY-MM-DD`, local time) | `{ date, status: 'held'\|'contact', mood, urge, note, time?, triggers[], wins[], sleep, energy, good, tomorrow, createdAt, updatedAt }` (`time` only on contact entries; the other new fields are optional, so older entries still work) |
| `settings` | `key` | `{ key, value }` holding `startDate`, `startTime` (`HH:MM`), `goal`, `reason`, `friendName`, `friendPhone`, `reminderTime` |
| `urges` | `at` (ISO time) | `{ at, before, after, tags[], activity, waitedMin }`, one per urge finished in urgent help (added in version 2; existing data is kept on upgrade) |

Each day has one check-in because the date is the key, so saving again replaces that day's entry.

## How streaks are calculated (`js/streaks.js`)
- **Days of No Contact:** whole 24-hour days since the start moment (date + time) or the most recent "had contact" check-in, whichever is later. Older data with no time counts from midnight, as before.
- **Longest run:** the largest gap between consecutive start or contact events, including the current run.
- **Check-in streak:** consecutive days with any check-in that end today. If you haven't checked in yet today, the streak still counts up to yesterday as a one-day grace period.
- Check-in dates are local calendar dates. The live counter uses true elapsed time, so it never jumps backwards, even when the clocks change.

## Customising
- **Shipping changes:** increase `CACHE_VERSION` in `sw.js` whenever you edit a cached file, otherwise users keep the old version.
- **Milestones:** edit `MILESTONES` in `js/streaks.js`.
- **Urgent help:** change `PEAK_URGE` (default 8) or `WAIT_MS` (default 20 minutes) at the top of `js/app.js`.
- **Name and icons:** the display name is in `index.html`, `manifest.webmanifest` (`name`, plus `short_name` for the home-screen label, which phones truncate at around 12 characters) and `offline.html`. The IndexedDB name, backup marker and cache prefix still say `clear-days` on purpose, so existing data, backups and caches keep working.
- **Colours and fonts:** change the CSS custom properties at the top of `css/styles.css`, and update `theme_color` in the manifest to match. The calm centrepiece's motion lives in the "Calm centrepiece" section of that file.
- **New fields:** add them to the form in `index.html`, read them in `onCheckinSubmit` in `app.js`, and add an `if (event.oldVersion < 2)` migration in `db.js` if you need new stores or indexes.

## Deploying
Upload the folder as-is to any static host with HTTPS, such as GitHub Pages, Netlify, Vercel or Cloudflare Pages. All paths are relative, so it also works from a subfolder.
