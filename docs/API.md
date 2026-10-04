# Route handlers

What the screens can call. Every route lives under `/api`, takes and returns JSON, and is the only way a screen reads or writes data.

**Status, 2026-10-04:** every route below is live on production. The account and workflow routes are covered by an end-to-end check (`npm run check:accounts`).

## Conventions

- **Signed in or not.** Signing in sets an httpOnly cookie. Screens never see or store a token; they call `fetch` with `credentials: "same-origin"` and that is all.
- **Success** is `200` with `{ "ok": true, ... }`.
- **Failure** is `{ "ok": false, "error": { "code": "...", "message": "..." } }`. `code` is for the screen's logic; `message` is plain English and safe to show. Validation failures add `"fields": { "<name>": "<what is wrong>" }` inside `error`.
- **Codes any route can return:** `signed_out` (401), `invalid_input` (400), `unavailable` (503, try again).
- Nothing is cached: every response carries `Cache-Control: no-store`.

## Accounts

People sign in with an email and a password. There is no confirmation email and no password reset yet.

An account has no role of its own. **A role belongs to a workflow**: whoever creates a workflow is its `expert`, and the people the expert invites are its `new_hire`s. One person can be an expert on one workflow and a new hire on another.

### `POST /api/auth/sign-up`

```json
{ "email": "ada@example.com", "password": "at least 8 characters", "name": "Ada", "invite_code": "optional" }
```

Creates the account and signs it in. Sign-up needs either a valid `invite_code` or a pending invitation to a workflow for that email; with an invitation, the code can be left out and the person joins that workflow at once.

Returns `{ "ok": true, "user": User }`.

| Code | Status | When |
|---|---|---|
| `invalid_input` | 400 | A field is missing or malformed. See `error.fields`. |
| `invite_required` | 403 | No valid invite code and no invitation for this email. |
| `email_taken` | 409 | An account with this email exists. |

### `POST /api/auth/sign-in`

```json
{ "email": "ada@example.com", "password": "..." }
```

Returns `{ "ok": true, "user": User }`.

| Code | Status | When |
|---|---|---|
| `invalid_credentials` | 401 | The email or the password is wrong. The response does not say which. |

### `POST /api/auth/sign-out`

No body. Always returns `{ "ok": true }` and clears the cookie.

### `GET /api/me`

Who is signed in, and the workflows they belong to.

```json
{
  "ok": true,
  "user": { "id": "uuid", "email": "ada@example.com", "name": "Ada" },
  "workflows": [
    { "id": "uuid", "task": "Review incoming invoices", "tool": { "id": "uuid", "name": "Invoice desk" }, "role": "expert" }
  ]
}
```

Returns `signed_out` (401) when nobody is signed in. A screen that gets `signed_out` from any route sends the person to `/sign-in`.

`User` is always `{ "id", "email", "name" }`.

## Workflows and the people on them

### `POST /api/workflows`

Starts a workflow. The person who creates it becomes its expert.

```json
{ "tool_name": "Invoice desk", "tool_url": "https://invoices.example.test", "task": "Review incoming invoices", "role": "Accounts payable specialist" }
```

`tool_url` and `role` (the expert's job title, as text) are optional.

Returns `{ "ok": true, "workflow": { "id", "task", "tool": { "id", "name" }, "role": "expert" } }`.

### `GET /api/workflows/{id}/people`

Expert only. Who is on the workflow and who has been invited.

```json
{
  "ok": true,
  "members": [{ "user_id": "uuid", "name": "Ada", "email": "ada@example.com", "role": "expert" }],
  "invitations": [{ "id": "uuid", "email": "new@example.com", "role": "new_hire", "created_at": "2026-10-04T09:00:00Z" }]
}
```

### `POST /api/workflows/{id}/invitations`

Expert only. Invites a person to learn the workflow.

```json
{ "email": "new@example.com" }
```

Returns `{ "ok": true, "status": "added" }` when an account with that email exists (the person is on the workflow at once), or `{ "ok": true, "status": "invited" }` when it does not (they join when they sign up with that email). No email is sent: the expert tells the person themselves.

### `DELETE /api/workflows/{id}/invitations/{invitation_id}`

Expert only. Withdraws an invitation that has not been taken up. Returns `{ "ok": true }`.

### Codes for the workflow routes

| Code | Status | When |
|---|---|---|
| `not_found` | 404 | No such workflow, or the person is not on it. |
| `not_expert` | 403 | The person is on the workflow but is not its expert. |
| `already_member` | 409 | The invited person is already on the workflow. |

## Expert sessions

One session is one recording of the expert at work. Its phases, in order: `setup`, `capture`, `debrief`, `ended`.

**A screen does not call most of these routes itself.** The capture engine (below) does, and hands the screen a view to render. The two a screen calls directly are the first two.

Every session route answers `not_found` (404) unless the person signed in is the one who started the session and is still the workflow's expert. A route called in the wrong phase answers `wrong_phase` (409).

### `POST /api/workflows/{id}/sessions`

Expert only. Starts a session in its `setup` phase. Body: `{ "language": "en" }`, optional, a two-letter code.

Returns `{ "ok": true, "session": Session }`.

### `GET /api/sessions/{id}`

The session as it stands, with everything recorded so far in time order.

```json
{
  "ok": true,
  "session": { "id": "uuid", "workflow_id": "uuid", "kind": "expert", "language": "en", "phase": "capture", "started_at": "...", "ended_at": null },
  "workflow": { "id": "uuid", "task": "Review incoming invoices", "role": "Accounts payable specialist", "tool": { "id": "uuid", "name": "Invoice desk" } },
  "config": { "screen_still_ms": 1500, "min_questions": 3, "...": "every setting, with defaults filled in" },
  "events": [Event],
  "utterances": [{ "id": "uuid", "session_id": "uuid", "speaker": "expert", "start_ms": 30000, "end_ms": 33000, "text": "This one is from a new supplier." }],
  "questions": [Question]
}
```

`Event` and `Question` are the records in `CONTRACT.md`. `speaker` is `expert` or `agent`. Times are milliseconds since the session started.

### Routes the capture engine calls

| Route | What it does |
|---|---|
| `POST /api/sessions/{id}/start` | Begins capture and starts the clock. |
| `POST /api/sessions/{id}/voice` | Hands out a signed address for the interviewer, a single-use transcription token and the values for the interviewer's prompt. `voice_unavailable` (503) when voice cannot be started; capture carries on without it. |
| `POST /api/sessions/{id}/conversation` | Records which voice conversation the session runs in. |
| `POST /api/sessions/{id}/frames` | Takes one frame as a form (pictures and its time), stores it, reads it, and returns `{ frame, read, events, screen, new_words, questions }`. |
| `POST /api/sessions/{id}/frames/{frame_id}/key` | Marks a key frame and passes its picture to the voice conversation. Returns `{ file_id }`, or `null` when the picture could not be passed on. |
| `POST /api/sessions/{id}/plan` | Plans Tiro's turn for the decision on one frame. Returns `{ plan, questions }`; `plan` is `{ frame_id, decision_t_ms, summary, question }` or `null`. |
| `POST /api/sessions/{id}/utterances` | Stores one stretch of speech. |
| `PATCH /api/sessions/{id}/questions/{question_id}` | Records what became of a question: `status`, `channel`, `answer_utterance_id`. |
| `POST /api/sessions/{id}/end-task` | The expert has finished. The session moves to `debrief`; questions still waiting to be asked live wait for the debrief. |

## The capture engine

`src/capture/engine.ts` runs one expert session in the browser: the screen sensor, the voice, the transcriber and the Conductor. It has no React in it. A screen creates one, gives it a callback, and renders the view it is handed. The session bench at `/spikes/session` is a bare example.

```ts
import { createCaptureEngine, EMPTY_VIEW, type CaptureView } from "@/capture/engine";

const engine = createCaptureEngine(sessionId, (view: CaptureView) => render(view));
```

The start takes two clicks, because of how the browser behaves:

1. `engine.prepare()` from a click, while Tiro's tab is in front. It loads the session and opens the voice; this is when the browser asks for the microphone. The view's `phase` goes `idle` → `preparing` → `ready`.
2. Open the companion window now, if there is one: it also needs a click in Tiro's tab.
3. `engine.share()` from a second click. The browser asks which tab to share and then **moves to that tab at once**, so nothing after this can need Tiro's tab. `phase` becomes `capturing` and Tiro opens with its greeting.

| Call | What it does |
|---|---|
| `engine.callTiro()` | The button that calls Tiro. The same as saying its name. |
| `engine.setMuted(true)` | Nothing the microphone hears is kept and Tiro takes no turn of its own, until unmuted. |
| `engine.endTask()` | The expert has finished. `phase` goes `ending` → `ended`. Also happens when the expert stops sharing from the browser's own bar. |
| `engine.reconnectVoice()` | Tries the voice again when the view's `voice` is `lost`. |
| `engine.release()` | Lets go of the screen and the microphone without ending the task. Call it when the screen unmounts. |
| `engine.view()` | The current view. |

What the view holds (`CaptureView`):

| Field | Meaning |
|---|---|
| `phase` | `idle`, `preparing`, `ready`, `capturing`, `ending`, `ended` |
| `voice` | `off`, `connecting`, `on`, `lost`. Capture runs without voice; Tiro then only watches |
| `floor` | `state` (`closed` or `open`), `kind` (`opening`, `summary`, `called`), `turnsInWindow`, `owed` (Tiro is behind on its three turns in ten minutes), `waitingFor` (`screen`, `speech`, `reading`, `gap`, `question` or null: why Tiro is not speaking yet) |
| `agentSpeaking`, `muted` | |
| `elapsedMs` | Time since sharing began |
| `screen` | `{ name, item }`: what the screen shows now, as Tiro read it |
| `reading`, `frames`, `lastFrame` | Whether a frame is being read, how many were taken, and the latest one as a picture (a `Blob`) for a preview |
| `events` | The contract's events, oldest first |
| `spoken` | `{ key, id, speaker, start_ms, end_ms, text }`, oldest first. `key` is stable from the first moment; `id` is set once stored |
| `partial` | What the transcriber is hearing right now |
| `questions` | The contract's questions |
| `planned` | `{ summary, question }`: what Tiro will say at the next pause, or null. It goes back to null when the pause did not come in time |
| `floors` | Every turn that has ended: `kind`, `openedAt`, `closedAt`, `reason`, `agentTurns`, `plan` |
| `problem` | The last thing that went wrong, in plain words. The session carries on |

`describeEvent(event)` and `isDecision(event)` in `src/conductor/describe.ts` turn an event into one plain line and say whether it is a decision.

## The debrief and the Work Map

When the expert ends the task, the session is in its `debrief` phase. The debrief ends when the expert confirms the Work Map; the session is then `ended`.

### `GET /api/workflows/{id}/sessions`

Expert only. The expert's own sessions on the workflow, newest first: `{ "sessions": [{ "id", "phase", "language", "started_at", "ended_at", ... }] }`. The session to debrief is the newest one whose `phase` is `debrief`.

### `GET /api/workflows/{id}/work-map`

For anyone on the workflow. The expert gets the newest Work Map, draft or confirmed. A new hire gets the newest confirmed one. `work_map` is `null` when there is none yet.

```json
{
  "ok": true,
  "work_map": {
    "id": "…", "workflow_id": "…", "session_id": "…", "version": 1,
    "status": "draft", "created_at": "…", "confirmed_at": null,
    "steps": [
      {
        "id": "…", "position": 1, "title": "Hold the order", "decision": "Held the order for review.",
        "is_judgment": true,
        "reason": { "utterance_id": "…", "text": "The expert's own words." },
        "moment": {
          "event_id": "…", "frame_id": "…", "t_ms": 84700, "what": "Pressed \"Hold\" on Order 7.", "picture": "https://…",
          "screen": { "name": "Orders", "item": "Order 7", "fields": [{ "name": "Amount", "value": "12,400" }] }
        },
        "rules": [1]
      }
    ],
    "rules": [
      {
        "id": "…", "number": 1, "lineage_id": "…", "version": 1,
        "kind": "limit", "statement": "The rule in one plain sentence.",
        "quote": { "utterance_id": "…", "text": "The expert's own words." },
        "moment": { "event_id": "…", "frame_id": "…", "t_ms": 84700, "what": "…", "picture": "https://…", "link": "direct" },
        "action": { "type": "block" },
        "status": "candidate", "provenance": "live_question", "documented": false, "check_type": "judged",
        "history": [{ "version": 1, "statement": "…", "status": "candidate", "created_at": "…" }],
        "steps": [1]
      }
    ]
  }
}
```

- `status` of the map is `draft` or `confirmed`.
- A step's `reason` is `null` while the expert has not said why. A map with such a step cannot be confirmed.
- `moment.picture` is the screen at that moment: a signed address that works for about two hours. Load the map again for a fresh one. It can be `null`. `moment.screen` is what the reader read on that screen: its name, the item open on it and that item's fields. It can be `null`.
- A rule's `history` lists every version of it, oldest first; the last entry is the rule as it stands. A corrected rule has more than one.
- A rule's `number` is its place in the list and stays the same when the rule is corrected. `steps` are the positions of the steps it belongs to; a step's `rules` are rule numbers.
- `kind` is a key of the rule kinds table (`limit`, `exception`, `stop_and_ask`, `never`, `judgment`, or one a workflow adds). Show it as given.
- `action.type` is `block`, `warn`, `ask`, or `escalate` (then with `role`).
- A rule's `status` is `candidate`, `confirmed` or `corrected`. `provenance` is `observed` (said while working), `live_question` (an answer to Tiro during the task), `debrief` or `baseline_confirmed`. `moment.link` is `direct` (said at that moment) or `related` (the nearest moment to a rule the expert only described).
- `documented` is true when the company's written process already held the rule; otherwise it was newly captured. Show the two labels.
- `check_type` is `judged` (a model judges each case) or `deterministic` (a fixed check over the tool map; the rule then has a `condition`).

### `GET /api/work-maps/{id}`

One Work Map by its id, in the same shape. A new hire can read it only once it is confirmed.

### Routes the debrief engine calls

| Route | What it does |
|---|---|
| `POST /api/sessions/{id}/debrief` | Prepares the debrief. Reads every decision a second time from its frame of record: agreement verifies the event, disagreement becomes a question. Returns `{ verified, doubted, ask, listed }`: `ask` are the questions Tiro asks aloud, in order; `listed` are the rest. Takes up to half a minute. |
| `POST /api/sessions/{id}/voice` | As in capture. |
| `POST /api/sessions/{id}/utterances` | As in capture. |
| `PATCH /api/sessions/{id}/questions/{question_id}` | As in capture. `{ "status": "dropped" }` dismisses a question. |
| `POST /api/sessions/{id}/work-map` | Builds the session's Work Map as a draft, replacing an earlier draft. Body `{ "final": false }`. Returns `{ work_map, gaps, left_out }`. `gaps` are questions the validator sent back: steps that still lack the expert's reason. `left_out` is what it refused, as `{ what, text, why }`. With `final: true` a step still without a reason is left out instead of asked about. `builder_unavailable` (503) when the map could not be put together. |
| `PATCH /api/work-maps/{id}/steps/{position}` | Expert only. Corrects a step. `{ "correction": "what the expert said" }` rewrites it to say that; `{ "title", "decision" }` sets the text. Returns `{ step, work_map }`. |
| `PATCH /api/work-maps/{id}/rules/{number}` | Expert only. Corrects a rule: `{ "correction" }` or `{ "statement" }`. The rule gets a new version and keeps its number. Returns `{ rule, work_map }`. Also works on a confirmed map. |
| `POST /api/work-maps/{id}/confirm` | Expert only. Confirms the map and ends the session. `incomplete` (409) when a step lacks its screen moment or its reason; the message says which. |

## The debrief engine

`src/capture/debrief.ts` runs the debrief in the browser: the voice conversation, the building of the map, the teach-back, corrections and confirmation. Like the capture engine it has no React in it. The debrief bench at `/spikes/debrief` is a bare page built on it; read `src/app/spikes/debrief/debrief-bench.tsx` for a working example.

```ts
import { createDebriefEngine, EMPTY_DEBRIEF, type DebriefView } from "@/capture/debrief";

const engine = createDebriefEngine(sessionId, (view) => setView(view));
```

`engine.start()` must be called from a click: this is when the browser asks for the microphone. Then everything runs by itself:

1. `preparing`: the decisions are read a second time and the questions are put in order (up to half a minute).
2. `asking`: Tiro asks the `ask` questions aloud, one at a time, and the expert answers. This is an ordinary conversation.
3. `building`: when Tiro has asked its questions, the map is built (about ten seconds). If the validator sends questions back, the phase returns to `asking` once, for at most three more.
4. `teach_back`: `workMap` is set. Tiro explains it back in under a minute. The expert corrects a step or a rule by saying so, and the map on screen changes; or edits its text on screen.
5. `confirmed`: the expert said it is right, or pressed the button.

| Call | What it does |
|---|---|
| `engine.start()` | Begins the debrief. From a click. |
| `engine.build()` | "I have answered": builds the map now and goes on to the teach-back. Tiro does this by itself when it has asked its questions. |
| `engine.confirm()` | Confirms the map. The same as the expert saying it is right. |
| `engine.editStep(position, { title, decision })` | Sets a step's text from the screen. |
| `engine.editRule(number, statement)` | Sets a rule's text from the screen. |
| `engine.dismiss(questionId)` | The expert does not want this question asked. |
| `engine.setMuted(true)` | Tiro does not hear the expert until unmuted. |
| `engine.release()` | Ends the voice. Call it when the screen unmounts. |
| `engine.view()` | The current view. |

What the view holds (`DebriefView`):

| Field | Meaning |
|---|---|
| `phase` | `idle`, `preparing`, `asking`, `building`, `teach_back`, `confirmed` |
| `problem` | The last thing that went wrong, in plain words, or null |
| `voice` | `off`, `connecting`, `on`, `lost`. Without voice the map can still be built and confirmed with the buttons |
| `agentSpeaking`, `muted` | |
| `verified`, `doubted` | How many screen events the second reading verified, and how many it doubted and turned into questions |
| `ask` | The questions Tiro asks aloud, in order |
| `listed` | The rest of what Tiro wondered about. Each can be dismissed |
| `spoken` | The conversation so far, as in capture |
| `workMap` | The Work Map, in the shape above, or null before it is built |
| `leftOut` | What the validator refused to put in the map: `{ what, text, why }` |

## The tool map and the baseline

Both belong to session setup: what Tiro knows of the tool, and what it assumes about the task, before it watches.

### `GET /api/workflows/{id}/tool-map`

For anyone on the workflow. The tool's screens and what is on each.

```json
{
  "ok": true,
  "tool_map": {
    "tool": { "id": "…", "name": "Invoice desk" },
    "screens": [
      {
        "id": "…", "name": "Invoice", "origin": "seen_live", "hidden": false,
        "elements": [
          { "id": "…", "kind": "status", "label": "Status", "allowed_values": ["Draft", "Held"], "personal": false, "origin": "seen_live" }
        ]
      }
    ]
  }
}
```

`kind` is `field`, `status` or `button`. `allowed_values` are the values the element was seen to take, or `null`. `origin` is `seen_live` for everything so far: the map is built from what Tiro read while the expert worked, so it is empty until a session has run.

### `POST /api/workflows/{id}/tool-map`

Expert only. Brings the tool map up to date with everything Tiro has read in the workflow's sessions. Returns `{ tool_map, added }`. Nothing the expert renamed, hid or marked is touched. It also runs by itself whenever a debrief is prepared.

### `PATCH /api/workflows/{id}/tool-map/screens/{screen_id}`

Expert only. `{ "name": "…" }` renames a screen, `{ "hidden": true }` hides it. A hidden screen is left out of the baseline and of fixed checks. Returns `{ tool_map }`.

### `PATCH /api/workflows/{id}/tool-map/elements/{element_id}`

Expert only. `{ "personal": true }` marks an element as personal data. The mark is stored; nothing is blurred yet. Returns `{ tool_map }`.

### `GET /api/workflows/{id}/baseline`

For anyone on the workflow. `{ "statements": [{ "id", "text", "source", "status" }] }`. `source` is `uploaded_process`, `tool_map`, `model_knowledge` or `previous_work_map`. `status` is `assumed`, `confirmed`, `contradicted` or `not_observed`; a statement is `assumed` until a Work Map bears it out.

### `POST /api/workflows/{id}/baseline`

Expert only. Assembles the baseline and replaces what was assembled before. Body `{ "process_text": "…" }`: the company's written process as plain text, up to 60,000 characters; leave it out when there is none. Read a text or Markdown file in the browser and send its content. The document itself is not kept, only the statements drawn from it. Takes up to half a minute. `baseline_unavailable` (503) when it could not be assembled.

### `POST /api/work-maps/{id}/compile`

Expert only. Runs the rule compiler over a Work Map: a rule that can be checked from the screen alone, using elements of the tool map, becomes a fixed check (`check_type` `deterministic`, with a `condition`); every other rule stays `judged`. Returns `{ fixed, judged, work_map }`. It also runs by itself when a map is confirmed, so a screen only needs it for a "check again" button.

## Tutor sessions

A tutor session teaches the workflow's newest confirmed Work Map to the person signed in, while they work a case in the tool. Anyone on the workflow can start one.

### `POST /api/workflows/{id}/tutor-sessions`

Starts a tutor session. Returns `{ session, work_map }`: the session (its `kind` is `tutor`, its `phase` is `teach`) and the Work Map it teaches, in the shape above. `no_map` (409) when the expert has not confirmed a Work Map yet.

### `GET /api/workflows/{id}/tutor-sessions`

The tutor sessions the person signed in has had on the workflow, newest first: `{ "sessions": [{ "id", "phase", "started_at", "ended_at", ... }] }`. For anyone on the workflow; each person sees only their own. A session whose `phase` is `ended` has its final report. This is how a screen finds a report again after the Tutor page has been left.

### `GET /api/sessions/{id}/report`

The mastery report of a tutor session, during it or after it has ended.

```json
{
  "ok": true,
  "report": {
    "session_id": "…",
    "work_map": { "id": "…", "version": 1 },
    "rules": [
      { "number": 1, "rule_id": "…", "kind": "never", "statement": "…", "outcome": "needed_hint" }
    ],
    "totals": { "passed_first_time": 0, "needed_hint": 1, "violated": 0, "not_encountered": 1 },
    "practise_next": [1, 2]
  }
}
```

`outcome` is `passed_first_time`, `needed_hint` (the learner said they would break the rule and was caught before acting), `violated` (they broke it on screen) or `not_encountered`. Each rule gets the worst that happened to it. `practise_next` are rule numbers, most pressing first: violated, then needed a hint, then never met.

### Routes the tutor engine calls

| Route | What it does |
|---|---|
| `POST /api/sessions/{id}/voice` | As in capture. For a tutor session it hands out the tutor's address, and the Work Map and its id as the tutor's prompt values. |
| `POST /api/sessions/{id}/conversation`, `/frames`, `/utterances` | As in capture. The frames answer also carries `fields`: the fields of the item on screen, as `{ name, value }`. In a tutor session what the person says is stored with `speaker` `new_hire`. |
| `POST /api/sessions/{id}/check` | Checks the learner against the rules. `{ "kind": "prediction", "said": "…" }` checks what they say they would do; `{ "kind": "action", "frame_id": "…" }` checks what they did on that frame. Returns `{ verdicts, caught }`. `caught` lists the rules they broke: `{ rule, explanation, action }`, where `rule` is the rule in the Work Map shape, with the expert's quote and screen moment. |
| `POST /api/sessions/{id}/end` | Ends the tutor session. The report stays readable. |

## The tutor engine

`src/capture/tutor.ts` runs one tutor session in the browser: the screen sensor, the voice, the transcriber, the checks and the tutor's turns. It has no React in it. The tutor bench at `/spikes/tutor` is a bare page built on it; read `src/app/spikes/tutor/tutor-bench.tsx` for a working example.

```ts
import { createTutorEngine, emptyTutorView, type TutorView } from "@/capture/tutor";

// session and work_map come from POST /api/workflows/{id}/tutor-sessions
const engine = createTutorEngine(session.id, work_map, (view) => setView(view));
```

The order is the same as in capture, and for the same reason: the browser moves to the shared tab as soon as it is chosen.

1. `engine.prepare()` from a click, while Tiro's tab is in front. It opens the voice; this is when the browser asks for the microphone. `phase` goes `idle` → `preparing` → `ready`.
2. Open the companion window now, if there is one.
3. `engine.share()` from a second click. `phase` becomes `teaching` and Tiro greets the learner.

What then happens by itself: when the learner opens an item, Tiro says what the expert does with such an item and asks what they would do. Their answer is checked against the rules before Tiro replies. A broken rule is a catch: Tiro says the rule and the expert's reason, and `replay` is set so the screen can show the expert's moment. What the learner does on screen is checked too.

| Call | What it does |
|---|---|
| `engine.callTiro()` | The learner wants to ask something. The same as saying Tiro's name. |
| `engine.setMuted(true)` | Nothing the microphone hears is kept and Tiro takes no turn, until unmuted. |
| `engine.end()` | Ends the session and loads its mastery report into the view. `phase` goes `ending` → `ended`. Also happens when the learner stops sharing. |
| `engine.release()` | Lets go of the screen and the microphone without ending. Call it when the screen unmounts. |
| `engine.view()` | The current view. |

What the view holds (`TutorView`):

| Field | Meaning |
|---|---|
| `phase` | `idle`, `preparing`, `ready`, `teaching`, `ending`, `ended` |
| `problem` | The last thing that went wrong, in plain words, or null |
| `voice` | `off`, `connecting`, `on`, `lost` |
| `floor` | `state` (`closed` or `open`) and `kind`: `start`, `item` (Tiro has asked what the learner would do), `catch`, `called` |
| `agentSpeaking`, `muted`, `checking` | `checking` is true while an answer or an action is being checked against the rules |
| `elapsedMs`, `frames`, `lastFrame`, `reading`, `screen`, `events`, `spoken`, `partial` | As in capture. A line of `spoken` has `speaker` `new_hire` or `agent` |
| `workMap` | The Work Map being taught |
| `catches` | Every rule the learner broke so far: `{ at, rule, explanation, before_acting, what }`. `before_acting` is true when it was caught in what they said, false when in what they did |
| `replay` | The expert's moment to show now: a rule, with `quote.text` and `moment.picture`. Null when nothing is to be shown. It is set on a catch and cleared after half a minute. Show it where the learner can see it without leaving the tool: the companion window |
| `report` | The mastery report, in the shape above, once the session has ended |

## Agents outside Tiro

A confirmed Work Map can also be read by an AI agent that is not Tiro, so that it does the task the way the expert does and stops where the expert would. The agent connects to Tiro's MCP server and presents a key. The workflow's expert makes the key, and can withdraw it. A key reads the confirmed Work Maps of its own workflow and nothing else: no drafts, no other workflow.

All three routes are for the workflow's expert only.

### `GET /api/workflows/{id}/agent-keys`

The workflow's keys that still work, oldest first, and the address an agent connects to.

```json
{
  "ok": true,
  "keys": [
    { "id": "…", "name": "My agent", "hint": "j56c", "created_at": "…", "last_used_at": null }
  ],
  "server_url": "https://…/api/mcp"
}
```

`hint` is the last four characters of the key, so the expert can tell their keys apart. `last_used_at` is null until an agent has used the key.

### `POST /api/workflows/{id}/agent-keys`

Makes a key. Body: `{ "name": "My agent" }`, 1 to 80 characters. Returns `{ key, secret, server_url }`: `key` in the shape above, and `secret`, the key itself (`tiro_…`).

`secret` is in this answer and nowhere else. Tiro keeps only its hash. Show it once, let the expert copy it, and say that it cannot be shown again.

### `DELETE /api/workflows/{id}/agent-keys/{key_id}`

Withdraws a key. An agent that holds it is refused from then on. `not_found` (404) when the workflow has no such working key.

### What the expert gives their agent

Two things: `server_url` and the key. The agent connects over MCP's streamable HTTP transport and sends the key in the `Authorization` header, as `Bearer tiro_…`. For an agent that takes its MCP servers as JSON:

```json
{
  "mcpServers": {
    "tiro": {
      "type": "http",
      "url": "<server_url>",
      "headers": { "Authorization": "Bearer <the key>" }
    }
  }
}
```

A screen that shows this should fill in `server_url` from the route and the key from the answer that made it.

### What the agent can read

Five tools, all read-only. With a workflow's key, `work_map_id` may be left out of every one: the newest confirmed map of that workflow is used.

| Tool | Takes | Gives |
|---|---|---|
| `get_work_map` | | The tool and the task, every step in order with the expert's reason, and every rule with the expert's words and what to do when it would be broken |
| `get_step` | `position` | One step, with its rules in full |
| `list_rules_for_step` | `position` | The rules that belong to one step |
| `get_rule` | `number` or `rule_id` | One rule as it stands now, after any correction |
| `get_screen_moment` | `step` or `rule` | What the expert did at that moment, what the screen showed, and an address for its picture that works for about two hours |

A field the expert marked as personal data in the tool map is left out of what `get_screen_moment` says the screen showed. The picture is the screen as it was.

The tutor agent can use the same server, with the server's own secret in place of a key. That needs MCP servers switched on for the ElevenLabs workspace; until then the tutor works from the map it is handed at the start.

## Other routes

- `GET /api/health`: `{ "ok": true, "database": { "table", "rows" } }` or 503. Needs no sign-in.
