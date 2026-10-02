# Audit and optimisation — 2 October 2026

Baseline: `060aefe5b9ee6f05cfdae4d46d3ade5b1a9f1230`. This change retains the
existing Lovable React/Vite project rather than migrating its framework.

## Findings and changes

| Priority | Finding | Change |
| --- | --- | --- |
| High | Delay counted frames as if capture always achieved 10 fps | Timestamped frames and binary search against elapsed time; missing/stale history is not displayed as a valid delay |
| High | Buffer used base64 strings, full-array copying and React updates for each frame, with no byte ceiling | Async JPEG Blobs in a ring, 64 MiB/602-frame ceilings, canvas rendering and twice-per-second statistics |
| High | Late camera permission results and failed camera starts/switches could leak streams or leave misleading state | Generation guards, immediate cleanup, request deduplication, pending-request cancellation and retryable errors |
| High | Export errors could leave promises/recorders active and resources unreleased | Abortable scheduling/image decode, recorder error handling, stop timeout, finally cleanup and cancellation controls |
| High | The original npm lockfile had 24 advisories (including one critical) | Patched dependencies; compatible Vite 6, updated Lovable tagger, React Router 7 using the existing declarative routes, and a patched Vitest version |
| Medium | Delay could exceed buffer duration | Paired controls enforce a valid relationship; byte-limited history still reports unavailability |
| Medium | Resolution labels changed without reconfiguring capture; camera/geometry changes could mix frames | Restart on resolution/camera change, clear incompatible history, cap actual capture dimensions and show them |
| Medium | Resume could present old history as a current delayed feed | Resume clears history; pause disables tracks and preserves the frozen view for review/export |
| Medium | Codec support/selection logic was duplicated and could mislabel output or ignore partial preferences | One format table drives detection, fallback, display and encoder selection; final filename follows recorder MIME type |
| Medium | Frame-by-frame decode time stretched export duration; very short exports could lose the last frame | Absolute timestamp scheduling and a final-frame hold; export remains a real-time browser operation |
| Medium | Save could retain one snapshot while capture accumulated another full buffer | Save pauses capture until the user resumes; original Blob references are shared |
| Medium | Immediate download URL revocation could race browser downloads | Grace period before URL revocation; message says download started, not guaranteed saved |
| Medium | Browser capabilities/fullscreen assumptions could fail outside Chromium | HTTPS/camera/export guards and a CSS fullscreen fallback; clear retry guidance for iframe permission restrictions |
| Medium | Native wrapper always loaded a hard-coded remote Lovable URL with cleartext enabled | Preserve app ID, bundle dist by default, opt in to HTTPS live reload through an environment variable |
| Low | Lint errors, permissive app types and stale architecture/README | Strict app types, corrected UI-kit aliases/config imports, focused tests and rewritten documentation |
| Low | App mounted unused server-state and duplicate toast providers | Keep the used Toaster/Tooltip provider; remove unused runtime providers while retaining UI primitives for Lovable editing |

The memory improvement follows from changing representation and retention; it is
not a measured phone-speed claim. Blob buffering removes base64 expansion and
repeated whole-buffer copies. JPEG encode/decode still costs CPU. Capture remains
at a 10 fps target and does not become high-speed video analysis.

## Verification

- Focused Vitest/jsdom regression suite: 23 tests, including dropped-frame timing,
  ring wrap-around/byte limits, stream races, slow capture, camera restart,
  pause/resume/disconnects, export failure/timeout/cancel and late bitmap cleanup.
- Playwright: two passing Chromium tests using its synthetic camera. Exercised real
  canvas capture, delayed rendering, pause/resume, MediaRecorder download, Stop,
  paired settings and mobile-width layout. Synthetic input is not a physical camera.
- Strict TypeScript app/tooling checks and ESLint passed.
- Production and development builds passed; development build retains Lovable
  tagging. Default web build remains a static Vite SPA.
- npm audit: zero known advisories for the checked dependency tree at audit time,
  including development dependencies. This is not proof of absence of defects.
- The stale binary Bun lockfile was replaced by a readable `bun.lock` migrated
  from the patched npm dependency tree. npm and Bun dependency paths are validated locally; no CI workflow was added.

## Remaining limitations

Actual Android/iOS camera behaviour, sustained FPS, thermal load, total browser
memory, fullscreen/download quirks, native Capacitor packaging and the hosted
Lovable preview must be checked on the intended platforms. See [TESTING.md](TESTING.md).
No Lovable account was accessed and no live app was published.

MediaRecorder is a real-time recorder, not an offline frame-accurate muxer. A slow
browser may still miss scheduled frames during export. Formats are capability
checked; the browser may use software encoding. Auto avoids selecting AV1 solely
because it reports support. High-resolution scene detail may shorten the usable
history under the memory cap.

Do not describe this as an offline PWA or an individual-attempt loop player: neither
feature exists. Consider WebCodecs or a native pipeline only if measured device
results show the current browser workflow is insufficient.

## References

- [Lovable GitHub sync](https://docs.lovable.dev/integrations/github): changes on the
  selected branch sync back into the existing project; preview/publish remains a
  separate acceptance check.
- [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
- [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
