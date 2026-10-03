# Spike S3: a key frame attached to a triggered question

**Result: pass, with one fallback.** A picture of the screen can travel with a trigger, and the agent sees it and uses it. The fallback: the browser cannot upload the picture to ElevenLabs itself, so Tiro's server must do it.

Run on 2026-10-04 by Claude, with no person needed: four sessions, eight triggers with a picture.

## The question

When the floor opens, the Conductor sends the question trigger "with the key frame" (design section 4.2), so the agent can see what the expert was looking at. Design section 9, item 4, asks whether a picture can be attached to a triggered question inside a voice session.

## What was measured

Each session opened a voice session with the interviewer agent over its own connection, without a microphone. Two frames from Amr's Crystal recording were used: REQ-003 just after it was approved, and REQ-004 just after its priority was changed. Each was scaled to 1,568 pixels on its long edge and sent as JPEG (186 KB and 134 KB).

Nothing but the picture told the agent which requirement or which value was on screen. The trigger said only: look at the attached picture, ask why the status (or the priority) is set the way it is, and say the item's number and the value you see.

The pass marks were set by Claude and not agreed beforehand.

| Check | Pass mark | Measured |
|---|---|---|
| The picture uploads | every one | 8 of 8 with the workspace key; refused without it |
| The agent asks after a trigger with a picture | every trigger | 8 of 8 |
| The question names what only the picture shows | the item and the value | 8 of 8 |
| Time from the trigger to the question | no mark | about 1.0 s, the same as without a picture; one took 2.6 s |
| Time to upload a picture | no mark | 2.5 to 5.1 s; seven of the eight took under 2.8 s |

Two of the questions, as the agent put them:

- "I can see the requirement REQ-zero-zero-three has a status of Approved. Why is the status set to Approved?"
- "I see REQ-004 now. Why is the priority set to Critical?"

## The fallback

**The browser cannot upload the picture.** The interviewer and tutor agents require a signed session. For such an agent, ElevenLabs refuses an upload that carries no credentials, and its browser client sends none.

**So the upload goes through Tiro's server**: the browser sends the frame to a route handler, which uploads it with the workspace key and hands back the file's id; the browser then sends the trigger with that id. Tiro's server receives the frames anyway. In these runs the upload was made with the key, as the server would make it.

## Other findings

- **Uploading is the slow part.** A picture takes 2.5 seconds or more to upload; the question then comes in about a second. The upload should start when the decision is read from the screen, not when the floor opens. The floor waits for 2.5 seconds of stillness anyway.
- **ElevenLabs stores the pictures.** Each one is kept in its record of the conversation, with a link to the stored file. A frame sent to the agent therefore sits with ElevenLabs, as the context updates do (spike S2). Personal fields must be blurred before a frame is sent, and the off-the-record claim has to account for it.
- **There is a limit of ten pictures per conversation by default**, and only the ten most recent stay in front of the agent; older ones are summarised. Both are settings in the agent's configuration. A long session with a debrief will need them raised.
- **No separate charge for the pictures showed up.** ElevenLabs' API reference says uploads are billed per file. The session records show only voice and language-model charges, at the same rates as sessions without pictures (about 250 credits for 50 seconds with two pictures).
- **The agent writes for speech.** "REQ-003" came back as "REQ-zero-zero-three" in seven of the eight questions. What Tiro stores about items should come from its own events, not from the agent's words.
- **After the answer, the agent did not behave as instructed.** The test's answer was deliberately vague ("Because that is what the rules for this kind of item say"). In 5 of the 8 floors the agent spoke an acknowledgement and did not give the floor back; once it asked a follow-up and closed the floor in the same turn, so it could not have heard the reply. With clear answers in spike S2 it gave the floor back every time.
- **With no context at all, the agent declined to ask.** The first trigger of each session carried a question but came before any screen update or picture. In the runs where its reply was recorded, the agent said it had not seen any work yet.

## What this means for the build

1. A route handler uploads the key frame to ElevenLabs and returns the file's id. The Conductor starts this as soon as a decision is read.
2. The frame sent is the blurred one.
3. The agent configuration sets the picture limits explicitly.
4. **The Conductor closes the floor itself when the agent does not**: code decides, as the design says elsewhere. The agent's `yield_floor` is a signal, not the only way out.
5. The agent's instructions need work on what to do after an answer. The text check from spike S2 should gain a vague answer, so that this is tested before and after.

## Not covered

- The whole path in a browser with a live microphone: frame to Tiro's route, upload, and the trigger sent by the browser client. The message is the same one; it was not run end to end.
- More than two pictures in a session, and the ten-picture limit itself.
- Smaller pictures, or only the changed part of the screen, to shorten the upload.
- Whether the picture improves a question that the question planner has already worded.
- The tutor agent.

## How it was run

`npm run spike:s3 -- <picture> <what to ask about> <expected,words>`, with one or more pictures. The script sends one trigger without a picture for timing, then uploads each picture and sends a trigger with it attached, and checks that the agent's question contains the expected words. It compares without regard to how numbers are written out.

Full log of one run: `docs/spikes/data/s3-key-frame-run.txt`.
