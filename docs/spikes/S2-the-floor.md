# Spike S2: the floor

**Result so far: everything that can be checked without a person passes. The run with Amr at the microphone is still to do, and the result is not final until then.**

Status on 2026-10-04: the test page is built and deployed at `/spikes/floor`; three of the four questions are answered below; self-hearing through real speakers and the feel of the timing need a person.

## The question

While the expert works, Tiro's agent must be unable to hear and must not speak. It takes a turn only when the app tells it to, asks one question, and gives the floor back (design section 4.2). Scribe transcribes the expert all the while, and must never write down Tiro's own voice.

The spike covers four items from design section 9:

- 2: the floor with a real person working
- 3: Tiro not transcribing its own voice
- 6: how ElevenLabs bills a session that stays connected while the agent is muted
- 7: whether ElevenLabs' simulated conversations can include context updates and triggered messages

## Pass marks

These are proposed by Claude and **not yet agreed by Amr**. The test page shows each one live.

| Check | Pass mark |
|---|---|
| Silent on screen updates | no reply to five updates |
| Hears nothing and says nothing while the floor is closed | nothing heard, nothing said |
| Scribe hears the expert while the agent cannot | three sentences transcribed |
| Asks when triggered | a question after each of three triggers |
| Starts speaking soon enough | within 3 seconds of the trigger (median) |
| One question and at most one follow-up | no more than two turns per open floor |
| Gives the floor back by itself | every floor closed by the agent |
| Tiro does not transcribe its own voice | no kept transcript repeats the agent |

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

The agent used what the updates had told it. Asked to put "Why did you decide that just now?", it said "Why did you decide that the item looked fine to you?".

### In Chrome, with a recorded voice as the microphone

The test page was driven automatically, with a recorded voice looping three sentences in place of a microphone. One run of 69 seconds:

| Check | Result |
|---|---|
| Silent on screen updates | pass: 0 replies to 5 updates |
| Hears nothing and says nothing while closed | pass: heard 0, said 0 |
| Scribe hears the expert while the agent cannot | pass: 7 sentences |
| Asks when triggered | **2 of 3** |
| Starts speaking soon enough | 2.2 s and 2.7 s for the two questions asked |
| One question and at most one follow-up | pass |
| Gives the floor back by itself | pass: 3 of 3 |
| Tiro does not transcribe its own voice | not tested: there is no sound in the room in this run |

The trigger that drew no question: the recorded voice began a sentence just as Tiro started. Tiro stopped within a second, heard the sentence and gave the floor back. That is most likely the agent giving way to an expert who kept talking, as its instructions say, and not a missed trigger. The Conductor opens the floor only after 1.5 seconds of silence, which this automated run did not wait for.

### Billing while muted (item 6)

Measured on the Creator plan, from ElevenLabs' own record of each session:

| Session | Length | Charged | Of which |
|---|---|---|---|
| Connected, muted, silent | 179 s | 67 credits ($0.011) | silence 65, voice 2, language model 0 |
| Recorded voice, three floors | 69 s | 351 credits ($0.063) | voice 141, silence 7, language model 203 |

- **Silence is billed at about an eighth of the talking rate**: about 22 credits a minute against about 183.
- **A silent hour costs about 1,300 credits**, roughly $0.22.
- **The language model costs more than the voice** in a session with questions. Each turn sends the agent everything so far, so a long session with many updates makes each question dearer.

### Simulated conversations (item 7)

**They cannot carry context updates.** A simulation starts from a history of user and agent messages and tool calls; the published API has no entry for a context update. A trigger can be given as the last user message.

**Fallback, already working:** the text session above. It uses the real agent with the real mechanism, needs nobody to speak, and exits with an error when a check fails, so it can serve as the agent regression test the design asks for (section 4.4).

## Findings so far

- **ElevenLabs keeps the context updates.** They are stored in its record of the conversation. Whatever Tiro sends as an update (screen events, what the expert said) therefore also sits with ElevenLabs. This matters for the off-the-record claim (section 4.6).
- **After asking, the agent waits** by using its skip-turn tool, as designed.
- **The rule that drops Scribe output while Tiro speaks also drops the expert**, if the expert talks over Tiro. In the automated run three of the recorded voice's sentences were dropped this way.
- **Muting works from the first moment.** The agent's microphone is muted right after the session opens; nothing was heard before that in any run.

## Still to run, with Amr

On `https://tiro-ai.vercel.app/spikes/floor`, with speakers and not headphones, following the steps on the page (about five minutes):

1. **Self-hearing.** Whether Scribe writes down Tiro's voice coming out of the speakers, and whether the drop rule removes all of it.
2. **The eight checks with a real voice**, including answers of normal length and a follow-up question.
3. **How it feels**: whether the question comes soon enough, and whether Tiro gives the floor back at the right moment.

## Not covered

- A session longer than three minutes. The design expects up to an hour connected.
- Opening the floor only after the design's silence and stillness times. The page opens it when the button is pressed.
- The expert opening the floor by saying "Tiro", and pausing the agent when screen activity resumes.
- The WebRTC connection. The page uses the WebSocket connection.
- A key frame attached to the trigger. That is spike S3.

## How it was run

The page opens a voice session with the interviewer agent through a signed address from the server, mutes the agent's microphone at once, and starts Scribe with a single-use token, set to commit after 1.5 seconds of silence. "Send a screen update" sends a context update. "Ask a question" unmutes the microphone and sends a message starting `ASK:`. The agent's `yield_floor` tool mutes it again. Every event is logged with its time and scored by `src/app/spikes/floor/summary.ts`.

Raw result of the automated run: `docs/spikes/data/s2-auto-recorded-voice.json`.
