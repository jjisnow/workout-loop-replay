# Device acceptance checks

Run the commands in README first. Regression tests cover timing, byte ceilings,
cancellation, stream races, and encoder failures. Playwright exercises a real
Chromium canvas/MediaRecorder/download with a synthetic camera. Neither proves
mobile camera compatibility or thermal performance.

Test the synced Lovable preview in a new tab and the published HTTPS app on:

- Android Chrome, including the intended Samsung phone.
- iOS Safari if iPhone support matters.
- Desktop Chrome/Edge and Firefox as needed.

## Camera and controls

- Grant permission; deny and retry after changing browser permission. Also try
  Lovable's iframe preview, where the host's permission policy may block capture.
- Rapidly press Start, cancel a pending permission request, navigate away, then
  grant the old request. No late camera stream should remain active.
- Try another camera and switch repeatedly. A failed switch should stop cleanly,
  show an error and leave Start available.
- Change resolution while streaming; confirm actual captured dimensions and that
  the old buffer disappears. Rotate the device and check framing/letterboxing.
- Change delay above the buffer duration and lower the buffer below the delay;
  verify the paired setting adjusts and the view rebuilds instead of freezing.
- Pause, wait, then Resume. Resume must build fresh history. Switch apps and return;
  capture should be paused and any active export cancelled. Stop should release
  the camera. Pause disables tracks but retains the stream for resuming; some
  browsers may keep their camera permission indicator visible until Stop.
- Enter fullscreen, exit using both its button and system/Escape controls; check
  the in-page fallback on browsers without native fullscreen.

## Delay, memory and heat

Point the camera at a clock or record a visible clap. Compare live/delayed views
at 1, 6 and 30 seconds, both at 720p and 1080p. Run a 20–30-minute session with
a 60-second buffer and a detailed moving scene. Record actual delay, browser
memory, captured dimensions, responsiveness, device warmth and battery drain.
The UI's MB figure measures only retained JPEG bytes, not total browser memory.
If the memory ceiling shortens usable history, reduce resolution or delay.

Capture targets 10 fps, not high-speed biomechanics. The serial pipeline drops
throughput on a slow device rather than allowing pending frame tasks to accumulate.
A faster or WebCodecs capture pipeline is a separate enhancement, not validated here.

## Export

- Save a very short buffer, a full 60-second buffer and one after pausing. Capture
  must pause and Resume should remain available after completion or cancellation.
- Test Auto and each supported format preference. An unsupported codec/container
  pair may fall back; compare the displayed resolved format, downloaded extension,
  actual video metadata and playback in the intended player.
- Verify a non-empty file, framing, duration and final frame. Variable capture
  intervals should remain in the video timeline; overloaded browser encoding may
  still lose frames because MediaRecorder is a real-time API.
- Cancel during export, switch tabs and Stop. No cancelled file should be offered;
  the temporary encoder/canvas stream should release its tracks.
- Verify your browser actually saves the file. A triggered download is not proof
  of completion or compatibility with every mobile download manager.

## Lovable and native packaging

Verify that the merged branch is Lovable's selected sync branch, visual editing
still selects the existing components, and both preview and Publish → Update work.
Keep the repository connection/app ID unchanged. This audit does not authenticate
or publish the Lovable project.

If generating Capacitor native projects, test permission manifests, getUserMedia,
codec/export behaviour and orientation independently on the packaged app. Leave
`CAPACITOR_SERVER_URL` unset for a bundled release. The web tests do not validate
a native APK or iOS build.
