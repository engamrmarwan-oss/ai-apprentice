# Route handlers

What the screens can call. Every route lives under `/api`, takes and returns JSON, and is the only way a screen reads or writes data.

**Status, 2026-10-04:** every route below is live on production and covered by an end-to-end check (`npm run check:accounts`).

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

## Other routes

- `GET /api/health`: `{ "ok": true, "database": { "table", "rows" } }` or 503. Needs no sign-in.
