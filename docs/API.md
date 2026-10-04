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
  "config": { "screen_still_ms": 2500, "min_questions": 3, "...": "every setting, with defaults filled in" },
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
| `planned` | `{ summary, question }`: what Tiro will say at the next pause, or null |
| `floors` | Every turn that has ended: `kind`, `openedAt`, `closedAt`, `reason`, `agentTurns`, `plan` |
| `problem` | The last thing that went wrong, in plain words. The session carries on |

`describeEvent(event)` and `isDecision(event)` in `src/conductor/describe.ts` turn an event into one plain line and say whether it is a decision.

## Other routes

- `GET /api/health`: `{ "ok": true, "database": { "table", "rows" } }` or 503. Needs no sign-in.
