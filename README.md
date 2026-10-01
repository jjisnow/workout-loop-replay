# Workout Loop Replay

A browser-based form checker: perform a movement, then watch the camera view a few
seconds later. Built with React 18, TypeScript, Vite, Tailwind and shadcn/ui, with
Lovable's component tagger retained for visual editing.

[Open the existing Lovable project](https://lovable.dev/projects/fb546a84-b9ba-4b64-a54c-8b95ea6d08f5)

## Run and validate

Use Node.js **22 LTS or newer** (minimum Node 20):

```sh
npm ci
npm run dev
```

Open `http://localhost:8080`. Camera access requires HTTPS or localhost, browser
permission, and a camera. If Lovable's embedded preview blocks permission, open
its preview in a new tab or test the published HTTPS app. No API keys or backend
are required.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run build:dev
npm audit
```

Optional browser integration tests use Chromium's synthetic camera:

```sh
npx playwright install chromium
npm run test:browser
```

The test runner starts the Vite server automatically. If Chromium is already
installed elsewhere, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable.
`npm run test:watch` runs the focused regression suite interactively.

## Use

1. Select a delay and start the camera. The default delay is six seconds.
2. Wait for the delayed view to appear, perform a movement, and watch the result.
3. Pause to freeze the current view. **Resume clears old history** and builds a
   fresh buffer, preventing pre-pause images being presented as a current delay.
4. Save Video exports the retained buffer and **pauses capture**. Keep the tab
   visible while exporting; use Cancel export or Stop to cancel. Tap Resume when
   ready to continue.

Delay ranges from 1–30 seconds. The buffer ranges from 5–60 seconds; the controls
keep it at least as long as the requested delay. Resolution and camera changes
restart capture and clear old frames. The actual captured dimensions are shown
beneath the requested quality setting.

Capture targets **10 fps**; slower devices may capture fewer frames. Export is
video-only and runs in real time, using the original frame timestamps. Auto
prefers H.264/MP4, then available WebM codecs. Explicit codec/container preferences
can fall back to a supported combination; the UI and downloaded filename report
that combination. Browser encoder support does not guarantee hardware encoding
or playback compatibility with every video player.

The JPEG buffer is capped at **64 MiB** and 602 frames. High-resolution, detailed
scenes may reach that limit before the chosen duration. Reduce resolution or delay
if there is insufficient history. This limit covers buffered JPEGs, **not the
entire browser heap**: decoded images and an exported video also consume memory.

Frames remain in memory and are not uploaded by the capture/export code. Stop,
page exit, and component unmount release the stream and clear the buffer. Hiding
the tab pauses capture and cancels an active export. A browser download starts
from the app; check your browser's Downloads for completion.

## Continue editing in Lovable

Keep the existing project/repository connection. Merge reviewed changes into the
branch selected in Lovable's Git settings; Lovable only syncs one active branch
at a time. This repository keeps `src/`, React JSX, the `@/` alias, shadcn primitives,
Tailwind, `npm run dev/build/build:dev`, port 8080, and `lovable-tagger` in development.
No framework migration, server service, or build-time secrets are introduced.

After syncing, verify the preview, then use **Publish → Update** when ready to
update the live app. A Git commit does not itself verify or publish the Lovable
hosted app. See [Lovable's GitHub documentation](https://docs.lovable.dev/integrations/github).

Both npm and Bun lockfiles are committed (`bun.lock` requires Bun 1.2 or newer). After dependency edits, regenerate both
and validate both installation paths; do not leave an old Bun lockfile pointing
Lovable at a different dependency tree. The shadcn UI kit and its dependencies
remain available for further Lovable edits.

## Optional Capacitor packaging

`capacitor.config.ts` keeps the original app ID and now bundles `dist` by default.
It no longer loads a hard-coded remote Lovable page. The native Android/iOS
projects are not included and native camera permissions still require setup and
physical-device testing; the web regression suite is not a native certification.

For development live reload only, set `CAPACITOR_SERVER_URL` before invoking
Capacitor. HTTPS is required except for localhost HTTP. Leave it unset for a
bundled build. Adding the Capacitor Camera plugin alone would not replace this
app's continuous `getUserMedia` stream.

## Implementation and audit

- [Architecture and editing guidance](CLAUDE.md)
- [Audit findings, fixes and validation limits](docs/AUDIT.md)
- [Manual device acceptance checks](docs/TESTING.md)

This is a web app, not an offline-installable PWA: no service worker or offline
camera cache is provided. It shows continuous delayed video; it does not yet
select and repeatedly loop an individual attempt.
