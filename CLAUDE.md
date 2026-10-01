# Repository guidance

## Stack and Lovable compatibility

This is the existing Lovable React 18/Vite SPA. Preserve React JSX, `src/`, the
`@/` alias, Tailwind tokens, shadcn components, Vite port 8080, and development-only
`componentTagger()` in `vite.config.ts`. Do not migrate to SSR/native frameworks
or introduce a backend to solve camera buffering. Keep all camera APIs behind
user actions and capability checks. Node 22 LTS is recommended; Node 20 is minimum.

## Commands

```sh
npm ci
npm run dev          # localhost:8080
npm run typecheck    # strict app + tooling TypeScript checks
npm run lint
npm test             # Vitest/jsdom regressions
npm run test:watch
npm run test:browser # Playwright, synthetic Chromium camera; install browser first
npm run build        # dist/
npm run build:dev    # includes Lovable development tagging
npm audit
```

No CI workflow is required to run these checks. After dependency changes, keep
`package-lock.json` and `bun.lock` in sync and check a frozen Bun install. Avoid
changing dependency majors beyond those needed for security/compatibility.

## Data flow

1. `VideoRecorder.tsx` holds user-facing settings and export/fullscreen controls.
2. `useDelayedCamera.ts` owns camera permissions, stream lifecycle, capture,
   delayed rendering and cancellation of stale camera requests. An offscreen
   canvas JPEG-encodes via asynchronous `toBlob`; only one capture/decode cycle
   runs at a time. It targets 10 fps and requests a matching camera frame rate.
3. `FrameBuffer` holds timestamped JPEG Blobs in a ring. No frame arrays/base64
   strings live in React state. Retention is bounded by time, 602 frames, and
   64 MiB of JPEG bytes. Binary search selects a frame at/before the real target
   timestamp; more than one second of missing history is treated as unavailable.
4. The visible canvas draws one decoded frame; image resources are closed after
   drawing. React receives buffer statistics twice a second, rather than every
   captured frame. Its readiness flag only changes when availability changes.
5. Saving pauses capture and takes an ordered snapshot of Blob references.
   `videoUtils.ts` resolves one format table, schedules those JPEGs against their
   original timestamps on an export canvas, and records its stream. It cleans up
   on errors/abort and rejects an encoder that never finishes stopping. Downloads
   are labelled from the actual recorder MIME type; Blob URLs are revoked after
   a short download grace period.

## Invariants

- Settings maintain `bufferSeconds >= delaySeconds`; a byte limit may shorten
  actual retained history. Never fabricate a delayed view when history is missing.
- Pause disables camera tracks and invalidates pending capture completions;
  Resume clears history. Hiding the tab pauses capture and cancels export.
- Stop/unmount/page exit release tracks and buffers. A late permission result
  after Stop/unmount must release its newly acquired tracks, not restart capture.
- Camera/resolution/geometry changes clear old history. Only publish a new
  resolution after the camera starts successfully; show captured dimensions too.
- Browser export is real-time and best-effort. Do not claim 60 fps, native codec
  performance, lossless export, or constant total heap usage.
- One active export at a time. Pause capture during export so a second full
  buffer cannot accumulate. Pass the AbortSignal through image decoding/timers.
- Check codec/container support as a pair. Missing MediaRecorder must disable
  export without disabling the camera. Auto prioritises portable supported formats.
- No upload, disk cache, microphone capture, API key or server is needed.

## Editing conventions

Use the existing shadcn/Radix primitives and Tailwind palette; retain unused UI-kit
components so Lovable can continue visual editing. The ESLint Fast Refresh exception
is scoped to those primitives, whose mixed exports are intentional; application
components keep the rule. Add tests for timing, lifetime and failure behaviour,
not tests that merely copy implementation details. See `docs/TESTING.md` for device
checks not covered by mocks or Chromium's fake camera.

## Optional native wrapper

Capacitor bundles `dist` by default, retaining the original app ID. A remote URL
requires an explicit `CAPACITOR_SERVER_URL` (HTTPS except localhost). No native
platform projects or permission manifests are provided here. Continuous capture
uses web APIs, not the Capacitor still-camera plugin.
