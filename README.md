# Bass Fretboard Note Trainer

**English** | [한국어](README-KR.md)

A fretboard practice app for a four-string bass in standard tuning (E·A·D·G). Designed for phones in landscape orientation, it has three tabs.

| Tab | Route | What it does |
|---|---|---|
| Fretboard | `/` | Tap a string or fret to hear its note |
| Quiz | `/quiz` | Find a note on the fretboard from its name |
| Tuner | `/tuner` | Use the microphone to tune the open E·A·D·G strings |

## Features

### Fretboard
- Player's-eye view: string 1 (G) at the top, string 4 (E) at the bottom. The nut is on the left; use **Mirror** to reverse the layout.
- Open strings and frets 1–12. Notes are synthesized in the browser using the Karplus–Strong method, with no audio files. Supports simultaneous multi-touch playing.
- Labels cycle through natural notes, all notes with ♯/♭, and hidden. Accidentals show the sharp name above the flat name, such as C♯ / D♭.
- Each tap displays the note and position at the top, such as "A · string 3, fret 5."
- **Octave up** for phone speakers and **Fullscreen**.

### Quiz
- Find and tap the displayed note on a fretboard with hidden labels.
- Settings: fret range (0–5 / 0–12), note set (all seven natural notes / E·F·G / A·B·C), question count (7 / 10 / 20), and timer visibility.
- Scoring: ◎ for a correct answer within 3 seconds, ○ for a correct answer after 3 seconds, and X for an incorrect answer. Any position with the requested note is accepted.
- After a mistake, tap the highlighted reference position three times before continuing. The same note returns a few questions later.
- Results include ◎/○/X counts, average response time, whether the target was met (at least five ◎ answers in a 10-question quiz), per-note results, notes needing more practice, and **Retry missed notes**.
- Reference positions: E = string 4 open; F = string 4, fret 1; G = string 4, fret 3; A = string 3 open; B = string 3, fret 2; C = string 3, fret 3; D = string 2 open.

### Tuner
- Automatically detects the string you pluck. Tap a string name to lock onto that string, which is useful when it is far out of tune.
- Needle meter (±50 cents): green within ±5 cents, yellow within ±25 cents, and red beyond that.
- If the pitch is low, **Tune up** by tightening the string. If it is high, **Tune down** by loosening it.
- A string **passes** after staying within ±5 cents for 0.7 seconds. The app notifies you when all four strings have passed.
- Each string has a reference-tone button. Pitch detection pauses briefly during playback so the tuner does not judge the phone's own sound.
- Uses the YIN pitch-detection algorithm. Harmonics help detect the low E (41 Hz), which phone microphones can struggle to pick up.
- The microphone starts only when you press the button. It stops when you select **Turn off microphone** or switch to another tab.

## Getting started

Requirements: Node.js 20.19 or later (22 LTS recommended).

```bash
npm install
npm run dev
```

Open the URL printed in the terminal, normally http://127.0.0.1:5173. If another program is using port 5173, the server will not start; select a different port with a command such as `npm run dev -- --port 5174`.

| Command | Description |
|---|---|
| `npm run dev` | Start the development server with live updates |
| `npm run build` | Generate production files in `dist/` |
| `npm run build:pages` | Generate GitHub Pages files in `dist/` using hash routing |
| `npm run preview` | Preview the generated `dist/` |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Run the code linter |

`npm run check`, which runs type, build, and lint checks together, requires [Bun](https://bun.sh).

### Using a phone
- With your computer and phone on the same Wi-Fi network, run `npm run dev -- --host` and open the Network URL shown in the terminal on your phone to try the fretboard and quiz.
- **The tuner microphone requires HTTPS or localhost.** Deploy over HTTPS to use the tuner on your phone.
- When deploying a standard build (`npm run build`), configure the host's SPA fallback or rewrite rules to serve `index.html` for every route, so direct visits and reloads at `/quiz` and `/tuner` work. A separate GitHub Pages build is available as described below.

### GitHub Pages

npm is needed only at build time. GitHub Pages hosts the generated HTML, CSS, and JavaScript; no separate Node.js server or Bun installation is required.

- App: https://swannekim.github.io/bass-fretboard-note-trainer/
- Quiz: https://swannekim.github.io/bass-fretboard-note-trainer/#/quiz
- Tuner: https://swannekim.github.io/bass-fretboard-note-trainer/#/tuner

The Pages build uses hash routes such as `#/quiz` and `#/tuner`. Direct links and reloads work without server rewrites or a `404.html` workaround. Because the site uses HTTPS, the tuner can access the microphone once you grant permission.

In the repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. On each push to `main`, `.github/workflows/deploy-pages.yml` installs npm dependencies, checks types, builds for Pages, and deploys `dist/`. You can also deploy manually through **Actions → Deploy GitHub Pages → Run workflow**.

To preview a Pages build locally:

```bash
npm ci
npm run build:pages
npm run preview -- --base=/bass-fretboard-note-trainer/
```

Open http://localhost:4173/bass-fretboard-note-trainer/. Automated deployment uses the path from the Pages configuration; manual builds default to `/bass-fretboard-note-trainer/`. Use Vite's `--base` option for a different path. The existing routing behavior of `npm run dev` and `npm run build` is unchanged.

## Code structure

Files implementing the app's features:

| File | Purpose |
|---|---|
| `src/pages/home.tsx` | Fretboard tab |
| `src/pages/quiz.tsx` | Quiz tab |
| `src/pages/tuner.tsx` | Tuner tab |
| `src/components/fretboard.tsx` | Fretboard rendering, touch handling, and cell highlighting |
| `src/components/trainer-tabs.tsx`, `src/components/pill.tsx` | Tabs and buttons |
| `src/lib/fretboard.ts` | String, fret, and note model; sharp/flat notation; layout calculations |
| `src/lib/bass-audio.ts` | Bass sound synthesis |
| `src/lib/quiz.ts` | Quiz rules: reference positions, scoring, requeued questions, and results |
| `src/lib/pitch.ts` | YIN pitch detection |
| `src/lib/tuner.ts` | Tuning logic: cents calculation, needle stabilization, and pass conditions |
| `src/hooks/use-mic-tuner.ts` | Microphone start and stop |
| `src/hooks/use-trainer-chrome.ts` | Dark appearance and orientation detection |
| `src/lib/store.ts` | Shared settings such as mirrored layout and octave shift |
| `src/lib/nav.ts`, `src/routes.tsx` | Tab definitions and page routing |
| `src/index.css` | Colors, theme, and animations |

The remaining files, including `src/components/ui/`, other files in `src/lib/`, `vite.config.ts`, and `vite-dev-reload.ts`, come from the app template. Some integrate with the preview and publishing environment where the app was originally created.

Built with React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · Zustand · React Router 7 · lucide-react · Web Audio API.

## License

Copyright (C) 2026 swannekim.

The project's original code is provided under the **GNU Affero General Public License version 3 only (`AGPL-3.0-only`)**. See [LICENSE](LICENSE) for the full terms.

- You may use, modify, and redistribute the software under the license, while preserving copyright and license notices.
- When distributing covered code, you must provide its corresponding source under the AGPL's terms.
- If you make a modified version available over a network, you must offer users interacting with that version a way to obtain its corresponding source.
- The program is provided **without any warranty**. The full license governs the precise rights, obligations, and disclaimers.

Original source: https://github.com/swannekim/bass-fretboard-note-trainer

Every app tab includes a **소스 · AGPL** ("Source · AGPL") link to the source code and license. When deploying a modified fork, update the link in `src/components/trainer-tabs.tsx` and the source notice in `vite.config.ts` to point to **the corresponding source of the modified version you actually provide**. Linking only to this upstream repository does not fulfill the source-offer obligation for your modifications.

Existing licenses and copyright notices for third-party components, including the template, external libraries, and fonts, remain in effect. This project's license does not replace their original licenses. Builds include the app license (`LICENSE.txt`), bundled dependency notices collected by Vite (`THIRD_PARTY_LICENSES.txt`), and the Geist font's OFL notice (`GEIST_LICENSE.txt`) in `dist/`.
