# Spike S4: capture while the tool's tab is in front, and the companion window

**Result: pass**, on two runs taken together. No fallback is needed.

Run on 2026-10-03 by Amr in Chrome 154 on macOS, against Crystal, using the test page at `/spikes/capture`.

## The question

While an expert works, they are in the tool's tab, not in Tiro's. Chrome slows down a tab it considers hidden. The spike asks two things (design section 9, item 8, and section 4.1):

1. Does Tiro keep reading the shared tab at full pace while its own tab is hidden?
2. Does a small always-on-top companion window work, and do its buttons reach Tiro while Tiro is hidden?

## What was measured

The agreed pass check: Tiro hidden for five minutes, frames sampled every 250 ms with 95% of gaps within 375 ms, settled frames still detected, and the companion window on top with mute, off the record and end task reaching the app.

| Check | Pass mark | Measured | Run |
|---|---|---|---|
| Tiro hidden long enough | 5:00 | 5:42 | 1 |
| Samples on time while hidden | 95% of gaps within 375 ms | 95% within 254 ms; longest 257 ms; 1,362 gaps | 1 |
| Samples on time after five minutes hidden | (not in the pass mark) | 95% within 254 ms; 165 gaps | 1 |
| Frames keep arriving | more than none | 5,732 frames | 1 |
| Settled frames detected | at least one | 54, about 9.5 a minute | 1 |
| Companion stays open | whole run | open for the whole run of 1:50 | 2 |
| Companion buttons reach the app | all three, while hidden | mute, off the record, end task all received; the run ended 8 ms after End task | 2 |

Run 1 was a capture-only run: the companion was not opened. Run 2 was a short run with the companion. Every check passed in the run that exercised it, but **no single run passed all six**.

## Other findings

- **Resolution.** The tab is captured at the display's full resolution: 3024 × 1496. A whole settled frame as JPEG at quality 0.85 is about 357 KB (largest 488 KB) and takes about 29 ms to encode (longest 43 ms).
- **The page's own timers do slow down.** In run 1 a 250 ms timer on Tiro's page fired once a second while hidden. The sampler was unaffected because it runs in a worker.
- **The companion window lifts that slowdown.** In run 2, with the companion open, the same page timer kept its 250 ms pace (95% within 254 ms). This was seen in one run of 1:50 only.
- **A still screen is quiet.** While the tab is changing, frames arrive about every 33 ms. While it is still, Chrome sends one frame a second. "No new frame" can be treated as "no change".
- **Chrome switches tabs for you.** As soon as a tab is chosen in the sharing dialog, Chrome moves to it. Tiro's tab was hidden from the first second of both runs.

## What this means for the build

1. **The screen sensor reads frames in a worker.** The approach used here (the capture track's frames streamed to a worker, compared there on a small grid) is the one to build on. It works in Chromium browsers only, which matches the design's "Chrome and Edge".
2. **Nothing time-critical may rely on the page's own timers.** The Conductor's clocks (screen still, speech silent, reading allowance, minimum gap) must be driven from the worker. The companion's effect on page timers is a bonus, not a guarantee: the expert can close it.
3. **The companion must be opened before sharing starts.** Opening it needs a click in Tiro's tab, and Chrome leaves that tab the moment a tab is shared. The capture screen's start sequence is therefore: open the companion, then share.
4. **Frame budget.** Sending every settled frame whole would be about 3.3 MB a minute. The design sends the changed region at full resolution plus a downscaled full frame, which will be less.
5. **Run the watched tool as a production build.** During run 1, Crystal was in development mode and its developer error panel covered the screen. The panel was Crystal's own and unrelated to the capture, but in a real session Tiro would read it as part of the tool. Recordings and the demo should use a production build.

## Not covered

- All six checks in one run, and the companion open for longer than 1:50.
- Whether one click can both open the companion and start sharing. In both runs they were two clicks.
- Edge, Windows, and Tiro and the tool in different windows.
- A minimised or fully covered Chrome window, and Chrome's energy-saving modes.
- Sessions longer than six minutes.
- A voice session running at the same time. That is spike S2.

## How it was run

The test page shares a tab chosen by the user, reads its frames in a worker, samples every 250 ms, and marks a frame as settled once the screen has changed and then held still for 500 ms. It records the time of every sample, frame, settled frame and companion button press, and whether Tiro's tab was hidden.

Before the manual runs, the page was driven automatically in Chrome to confirm that capture, settle detection, encoding and the companion buttons work at all. That automation cannot hide a tab, so the hidden-tab measurements come only from the two manual runs.

Raw results: `docs/spikes/data/s4-run1-capture.json` and `docs/spikes/data/s4-run2-companion.json`.
