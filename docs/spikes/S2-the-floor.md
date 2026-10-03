# Spike S2: the floor

**Result: pass.** No fallback is needed for the floor itself. One fallback is needed for testing: ElevenLabs' simulated conversations cannot carry context updates, so the agent is checked through a text session instead.

One point is still to confirm with Amr: that the run used the laptop's speakers and not headphones. The self-hearing result only counts with speakers.

Run on 2026-10-04 by Amr in Chrome 154 on macOS, with the test page at `/spikes/floor`, plus automated runs by Claude.

## The question

While the expert works, Tiro's agent must be unable to hear and must not speak. It takes a turn only when the app tells it to, asks one question, and gives the floor back (design section 4.2). Scribe transcribes the expert all the while, and must never write down Tiro's own voice.

The spike covers four items from design section 9:

- 2: the floor with a real person working
- 3: Tiro not transcribing its own voice
- 6: how ElevenLabs bills a session that stays connected while the agent is muted
- 7: whether ElevenLabs' simulated conversations can include context updates and triggered messages

## What was measured, with Amr at the microphone

One run of 77 seconds: three sentences read aloud with the floor closed, five screen updates, three triggered questions, each answered aloud. The pass marks were proposed by Claude and shown on the page; Amr has not asked for changes.

| Check | Pass mark | Measured |
|---|---|---|
| Silent on screen updates | no reply to five updates | 0 replies to 5 |
| Hears nothing and says nothing while the floor is closed | nothing heard, nothing said | heard 0, said 0 |
| Scribe hears the expert while the agent cannot | three sentences transcribed | all three, as one transcript, because they were read without a pause |
| Asks when triggered | a question after each of three triggers | 3 of 3 |
| Starts speaking soon enough | within 3 s of the trigger (median) | 1.0 s (1.3, 1.0 and 1.0) |
| One question and at most one follow-up | no more than two turns per floor | 1 turn in each floor |
| Gives the floor back by itself | every floor closed by the agent | 3 of 3 |
| Tiro does not transcribe its own voice | no kept transcript repeats the agent | none: no transcript began while Tiro was speaking, and all four transcripts are Amr's own words |

An earlier run of 28 seconds was stopped after the three sentences. It is kept with the data but adds nothing.

## What the run showed beyond the checks

- **The agent closes the floor at the first pause, and can cut an answer short.** In the third floor Amr said "If it's concerning security, I need to ask someone." The agent heard "If it's concerning security." and gave the floor back; the rest was said to a muted agent. Scribe kept the whole sentence.
- **Scribe, not the agent, holds the full answer.** In the second floor the two also differ slightly at the start of the answer. The stored answer must come from Scribe.
- **The agent never asked a follow-up**: not in these three floors, and not in the six automated floors below. Its instructions allow one only when the reason, limit or exception is unclear.
- **The agent waited through a long think.** In the second floor 8.6 seconds passed between the end of the question and the start of the answer. The agent stayed quiet.
- **The agent used the screen updates.** Asked to put "Why did you decide that just now?", it said "Why did you decide that this one looks fine to you?", taking the words from an update.

## Checked without a person

### In text, with nobody speaking

A script opens a session over the agent's own connection and never sends audio: screen updates go as context updates, triggers and answers as typed messages (`npm run spike:s2:text`). Run twice, with the same result each time:

| Check | Result |
|---|---|
| Silent on screen updates | 0 replies to 5 updates |
| Asks when triggered | 1 question per trigger, about 1.5 s after it |
| One question and at most one follow-up | 1 turn per floor |
| Gives the floor back by itself | every floor, about half a second after the answer |
| Silent after the floor closes | 0 replies to a further update |

### In Chrome, with a recorded voice as the microphone

The test page was driven automatically, with a recorded voice looping three sentences in place of a microphone. One run of 69 seconds. There is no sound in the room in such a run, so it cannot test self-hearing. Of the other checks, all passed except one: the agent asked on **2 of 3** triggers.

On the third, the recorded voice began a sentence just as Tiro started. Tiro stopped within a second, heard the sentence and gave the floor back. That is most likely the agent giving way to an expert who kept talking, as its instructions say. The Conductor opens the floor only after 1.5 seconds of silence, which this automated run did not wait for.

### Billing while muted (item 6)

Measured on the Creator plan, from ElevenLabs' own record of each session:

| Session | Length | Charged | Of which |
|---|---|---|---|
| Connected, muted, silent | 179 s | 67 credits ($0.011) | silence 65, voice 2, language model 0 |
| Amr's run, three questions | 75 s | 386 credits ($0.070) | voice 184, silence 5, language model 197 |
| Recorded voice, three floors | 69 s | 351 credits ($0.063) | voice 141, silence 7, language model 203 |

- **Silence is billed at about an eighth of the talking rate**: about 22 credits a minute against about 183.
- **A silent hour costs about 1,300 credits**, roughly $0.22.
- **The language model costs as much as the voice** in a session with questions. Each turn sends the agent everything so far, so a long session with many updates makes each question dearer.

### Simulated conversations (item 7)

**They cannot carry context updates.** A simulation starts from a history of user and agent messages and tool calls; the published API has no entry for a context update. A trigger can be given as the last user message.

**Fallback, already working:** the text session above. It uses the real agent with the real mechanism, needs nobody to speak, and exits with an error when a check fails, so it can serve as the agent regression test the design asks for (section 4.4).

## What this means for the build

1. **The floor works as designed**: mute by default, context updates for silent context, a user message as the trigger, the `yield_floor` tool to close.
2. **Answers are stored from Scribe**, linked to the question by time. What the agent heard is not the record.
3. **The agent should wait longer before deciding the expert has finished.** ElevenLabs has a setting for this (`turn_eagerness`, with a `patient` value). Untested; to try in Phase 2.
4. **Whether the agent is too reluctant to follow up** is a question for the prompt in Phase 2, once real questions and answers exist.
5. **ElevenLabs keeps the context updates.** Their text is stored in its record of the conversation. Whatever Tiro sends as an update (screen events, what the expert said) therefore also sits with ElevenLabs. This matters for the off-the-record claim (section 4.6).
6. **The rule that drops Scribe output while Tiro speaks also drops the expert**, if the expert talks over Tiro. In the recorded-voice run three sentences were dropped this way. In Amr's run nothing was.
7. **Agent regression tests run as text sessions**, not as ElevenLabs simulations.

## Not covered

- **Confirmation that speakers were used** in Amr's run.
- More than one run with a person, and a follow-up question in voice.
- A session longer than three minutes. The design expects up to an hour connected.
- Opening the floor only after the design's silence and stillness times. The page opens it when the button is pressed.
- The expert opening the floor by saying "Tiro", and pausing the agent when screen activity resumes.
- A noisy room, a second voice, and a language other than English.
- The WebRTC connection. The page uses the WebSocket connection.
- A key frame attached to the trigger. That is spike S3.

## How it was run

The page opens a voice session with the interviewer agent through a signed address from the server, mutes the agent's microphone at once, and starts Scribe with a single-use token, set to commit after 1.5 seconds of silence. "Send a screen update" sends a context update. "Ask a question" unmutes the microphone and sends a message starting `ASK:`. The agent's `yield_floor` tool mutes it again. Every event is logged with its time and scored by `src/app/spikes/floor/summary.ts`.

Raw results: `docs/spikes/data/s2-run2-person.json` (Amr's run), `s2-run1-stopped-early.json`, and `s2-auto-recorded-voice.json`.
