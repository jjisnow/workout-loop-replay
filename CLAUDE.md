# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server on http://localhost:8080
npm run build      # Production build (outputs to dist/)
npm run build:dev  # Development build
npm run preview    # Preview production build
npm run lint       # ESLint check
```

There is no test suite. The app uses `bun.lockb` so `bun install` works alongside `npm install`.

## Architecture

**Workout Loop Replay** is a mobile-first PWA that shows a live camera feed alongside a configurable delayed playback of that same feed, letting athletes check their form in real time.

### Core data flow

1. `VideoRecorder.tsx` requests camera access via `navigator.mediaDevices.getUserMedia`, renders the live feed into a `<video>` element, and captures frames every 100 ms (10 FPS) by drawing the video to an offscreen canvas and extracting JPEG data URLs.
2. Frames are pushed into an in-memory circular array (the "frame buffer") whose max size is governed by the user's buffer-size setting.
3. A second `setInterval` reads the frame that was captured N seconds ago (the user's delay setting) and paints it onto the delayed-playback `<canvas>`.
4. When the user saves, `saveFramesAsVideo()` in `src/lib/videoUtils.ts` replays the frame array through a `MediaRecorder` attached to a canvas stream, encodes to the best available codec, and triggers a file download.

### Key files

| File | Responsibility |
|---|---|
| `src/components/VideoRecorder.tsx` | All recording state, frame capture/playback loops, settings UI, fullscreen handling |
| `src/lib/videoUtils.ts` | Video export: codec detection, `MediaRecorder` encoding, file download |
| `src/pages/Index.tsx` | Thin page wrapper that mounts `VideoRecorder` |
| `src/App.tsx` | React Router setup (`/` → Index, `*` → NotFound) with `QueryClientProvider` |
| `src/index.css` | Design tokens (HSL custom properties) and global styles |
| `tailwind.config.ts` | Fitness-specific color palette extensions |

### Codec selection (`videoUtils.ts`)

`getSupportedCodecs()` probes `MediaRecorder.isTypeSupported()` and returns a priority-ordered list. `getResolvedFormat()` picks the first supported combo from: AV1 > HEVC > H.264 > VP9, paired with MKV > MP4 > WebM containers. `saveFramesAsVideo()` uses the resolved format, encodes at 5 Mbps, and downloads the result.

### UI / styling conventions

- All UI primitives come from `src/components/ui/` (shadcn/ui over Radix UI). Add new primitives there via `npx shadcn@latest add <component>`.
- Tailwind utility classes only — no additional CSS files beyond `App.css` and `index.css`.
- The custom color palette (`--fitness-primary`, `--fitness-accent`, etc.) is defined as HSL CSS variables in `src/index.css` and mapped in `tailwind.config.ts`. Use these tokens rather than hard-coded colors.
- Path alias `@/` resolves to `src/` (configured in both `vite.config.ts` and `tsconfig.json`).

### Mobile / Capacitor

`capacitor.config.ts` targets Android and iOS. Camera permission strings are declared there. When making changes that touch camera or file-system APIs, verify the Capacitor plugin surface hasn't diverged from the Web API surface.

### Browser API surface

The app relies on `MediaDevices`, `Canvas`, `MediaRecorder`, `Permissions`, and `Fullscreen` APIs with no polyfills. Codec support is detected at runtime; do not assume any specific codec is available.
