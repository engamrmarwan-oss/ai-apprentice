# Spike S1: reading what the expert did from the screen

**Result: the design as written does not pass. A fallback is recommended, and it passed the accuracy check on this recording but not the speed check.**

- As designed (Haiku 4.5 reads each frame from a description of the previous screen): 1 of 5 decisions read, and false reports on half of the frames where nothing happened.
- Recommended fallback: show the reader the previous frame beside the current one, read live with Sonnet 5.5, and have Opus 5.5 re-read every settled frame for the Work Map. With the previous frame, Opus read 5 of 5 decisions and Sonnet 4 of 5, with no invented decisions.
- No model read a frame in under 2 seconds. The fastest was 2.3 seconds.

**Decision (Amr, 2026-10-04): Opus 5.5 alone.** Opus reads every settled frame live, with the previous frame beside it, and there is no second pass. The live reader's default model has been changed to match.

Two limits to keep in mind while reading: the recording holds only five decisions, and the labels were drafted by Claude and are **not yet checked by Amr**.

Run on 2026-10-03 and 2026-10-04 against a recording Amr made in Crystal with the recorder at `/spikes/record`: 6 minutes 7 seconds, 56 settled frames.

## The question

Design section 9, item 1: is vision accurate enough on the real tool? The design has a fast model read every settled frame live, and a strong model re-read key frames at the debrief so that only verified events feed the Work Map (section 4.1).

The pass marks agreed before the run:

1. At least 90% of the labelled decisions (`commit` and `status_change`) are read correctly.
2. No invented values after verification.
3. The fast model reads a frame in under 2 seconds (median).

## What was in the recording

Amr reviewed two requirements, REQ-003 and REQ-004. The labels hold 23 events on 20 of the 56 frames. Five are decisions:

| Frame | Time | Decision |
|---|---|---|
| 8 | 0:41 | Pressed **Regenerate** on REQ-003's formal spec |
| 15 | 1:32 | Pressed **Generate** for REQ-003's test scenarios |
| 27 | 2:11 | REQ-003 status changed from Draft to Approved |
| 29 | 2:17 | REQ-003 status changed from Approved to In progress |
| 48 | 5:02 | Pressed **Run gap analysis (project-wide)** on REQ-004 |

The other 18 events are one field change (REQ-004 priority from High to Critical), tab and screen changes, and requirements being opened. There was no reject, rewrite, merge or escalate in the recording.

## The design as written

Haiku 4.5 reads each frame, given the previous screen as a description. Opus 5.5 checks the frames where Haiku reported a decision.

| Check | Pass mark | Measured |
|---|---|---|
| Decisions read correctly | 90% | 1 of 5 (20%). A second run read 2 of 5 |
| Invented values after verification | none | None among decisions, but only one frame was ever checked |
| Median time to read a frame | under 2 s | 3.0 s |

What went wrong:

- **Haiku missed all three button presses**, in every run.
- **Haiku reported things that did not happen** on 18 of the 36 frames where the person only scrolled or moved the pointer. Thirteen times it reported a move to the "Formal" view, a switch at the top of the page, each time at 95% confidence. That switch never moved.
- **Checking only reported decisions does not help** when the reader does not report them. In the first run Haiku read one status change as an ordinary field change, so it was never checked.

When Opus checked every frame where Haiku reported anything (39 frames), it rejected 29 of Haiku's 43 reports, corrected 4 and confirmed 10. It also listed four presses Haiku had missed. That arrangement costs as much as letting Opus read every frame, and is slower.

## What fixed it

The reader was comparing a picture with a written description of the previous screen. Anything the description left out looked like a change. Two changes were made together:

1. The reader is shown the **previous frame as well as the current one**.
2. The reader is told **what it reported last time**, so that a button still showing "Generating..." is not reported again.

Their separate effects were not measured.

| Reader | Sees previous frame | Decisions read, of 5 | Frames with a false report, of 36 quiet ones | Median read | Cost per minute |
|---|---|---|---|---|---|
| Haiku 4.5 | no | 1 (second run: 2) | 18 (second run: 24) | 3.0 s | $0.04 |
| Haiku 4.5 | yes | 2 | 2 | 2.9 s | $0.05 |
| Sonnet 5.5 | no | 3 (low effort: 2) | 2 | 2.3 s | $0.10 |
| Sonnet 5.5, low effort | yes | 4 | 1 | 2.7 s | $0.13 |
| Opus 5.5 | no | 4 (low effort: 4) | 5 (low effort: 7) | 4.4 s | $0.21 |
| **Opus 5.5, low effort** | **yes** | **5** | **1** | **4.5 s** | **$0.26** |

Cost per minute is at this recording's pace of about nine frames a minute, at list prices.

Decision by decision, for the four arrangements that matter:

| Decision | Haiku, as designed | Haiku + previous frame | Sonnet + previous frame | Opus + previous frame |
|---|---|---|---|---|
| Pressed Regenerate | missed | missed | missed | read |
| Pressed Generate | missed | missed | read | read |
| Draft to Approved | read | read | read | read |
| Approved to In progress | read as a field change | read | read | read |
| Pressed Run gap analysis | missed | missed | read | read |

With the previous frame:

- **No model invented a decision.** Sonnet and Opus each reported two decisions the labels do not list: pressing "Approve specification" and "Start implementation". Both presses happened; the labels record them as the status changes they caused.
- **False reports nearly disappeared.** The one left in the Sonnet and Opus runs was Crystal's own result arriving (the regenerated spec, the generated tests), described as a field change.
- **Opus stopped repeating itself.** Without its last report it had reported "Generate" on four frames in a row.

All nine runs saw both status changes and the priority change, with the right requirement and the right values. Haiku twice gave one of them the wrong type.

## Recommended fallback

1. **Show the reader two pictures.** The previous settled frame goes with every read, and the reader's last report with it. This is now in the reader (`src/server/vision/reading.ts`), off unless the caller passes the previous frame.
2. **Live reader: Sonnet 5.5** in place of Haiku 4.5. On this recording Haiku was no faster (2.9 s against 2.7 s) and never read a button press.
3. **Opus 5.5 re-reads every settled frame**, not only the frames the live reader flagged, and its events are the verified ones that feed the Work Map. The live reader misses decisions, so a frame it did not flag can still hold one. These reads do not depend on each other and can run in the background during the session.

Together that is about $0.39 a minute of watching at this pace, or about $4 for a ten-minute capture.

A simpler alternative is Opus alone, live, with no second pass: $0.26 a minute and 5 of 5 here, but 4.5 seconds a frame instead of 2.7.

Amr chose this simpler alternative. The live reader now defaults to Opus 5.5 at low effort, the setting measured here; `VISION_FAST_MODEL` still overrides it.

One thing followed from having no second pass: the contract marked an event `verified` when the strong model had re-read it at the debrief. Amr clarified on 2026-10-04 that the re-reading meant is a spoken one: an event is verified when Tiro has read it back to the expert by voice and the expert has confirmed it. The contract now says so.

## Speed

No arrangement met the 2-second mark. Lowering the effort setting made no difference to speed for Sonnet or Opus.

The floor opens only after the screen has been still for 2.5 seconds (section 4.2), so a 2.7-second read mostly fits inside a wait that happens anyway. A 4.5-second read adds about two seconds to it. Whether either is early enough to ask "why" in the moment is for spike S2 to show, with a person at the microphone.

Two untested ways to make a read faster: send smaller pictures (three go with each read now), and stop listing the screen's fields on every read.

## Other findings

- **Two thirds of the frames showed nothing the person did.** Of the 36 quiet frames, 17 were pointer movement, the page's clock or a spinner, 16 were scrolling, 2 were Crystal's own results arriving, and 1 was the first frame. Every one costs a read.
- **Three stretches had no frame at all while the person worked**: 22, 32 and 16 seconds. A frame is taken only after half a second of stillness, and the person kept moving and scrolling. In the last stretch "Run gap analysis" was pressed at about 4:50 (from the video) and first appeared in a frame at 5:02. That delay is larger than any model's reading time.
- **One press, two events.** Pressing "Approve specification" is a `commit` and causes a `status_change`. The stronger readers report both.
- **Tabs are named inconsistently.** A tab change inside a requirement came back sometimes as `navigate` and sometimes as a change to a field called "Tab".
- **Crystal ran in development mode again.** The developer badge is visible at the bottom left of every frame. Nothing covered the screen this time.

## What this means for the build

1. The reader takes the previous frame and its own last report (done, with tests).
2. The live model and the re-reading pass change as recommended above, once Amr agrees.
3. The screen sensor needs two rules it does not have: take a frame anyway after a few seconds of continuous movement, and do not count a pointer-sized change as movement. Together they should close the gaps and drop about a third of the reads. Both are for Phase 2, with tests.
4. A status change and the press that caused it, on the same item in the same frame, are one decision. The question planner must not ask about it twice.
5. A change that appears when a busy button finishes is the tool's result, not the person's action. The reader should be told so, and the Work Map builder must not turn it into a step.
6. The reader should be told that a tab change is a `navigate`.

## Not covered

- **Amr's check of the labels.** Claude drafted them from the frames and the video before looking at any model output. Until Amr confirms the five decisions, the scores are provisional.
- **A larger sample.** One recording, five decisions, and each arrangement run once (the design as written, twice). Haiku's two runs differed, so the others would too. Five of five is one result, not a rate.
- **Reject and rewrite.** Neither was in the recording. Typed text and dialogs were not tested either.
- **The task itself.** Design section 18 names approve, rewrite, merge, reject and escalate. Amr confirmed on 2026-10-04 that Crystal has reject, rewrite and reprioritisation, and has no merge or escalate. The design's wording is to be brought in line.
- The previous frame at the default effort for Sonnet and Opus (only low effort was run), and the two changes to the reader's input separately.
- Using the checker's list of missed decisions. Today the pipeline ignores it.
- JPEG frames. The recording used lossless pictures; the product will upload JPEG.
- The tool map and the map check. The reader ran with an open vocabulary.
- Several runs overlapped in time, which may have affected the measured speeds slightly.

## How it was run

The recorder at `/spikes/record` shares a tab, saves every settled frame as a lossless picture with the region that changed, and records a video. The replay script (`npm run spike:s1 -- <folder>`) sends each frame to the reader as the product would: the whole frame scaled to 1,568 pixels on its long edge, plus the changed region at full resolution. It then scores the readings against `labels.csv`. `--pair` adds the previous frame, `--carry` adds the reader's last report, and `--rescore` scores an earlier run again after the labels change.

A decision counts as read when the type, the item and the new value (or the button's label) match, on the labelled frame or the next one.

Labels: `docs/spikes/data/s1-labels.csv`. Raw results, one file per run: `docs/spikes/data/s1-*.json`. The frames and the video stay on Amr's machine.
