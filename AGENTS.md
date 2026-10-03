# Tiro

Tiro is an apprentice that watches an expert work in any tool, asks why at the right moments, turns what it learned into a Work Map, and teaches it to a new hire.

Two coding agents build this repo. This file is for both. `CLAUDE.md` adds notes for Claude Code.

## Source of truth

- `docs/TIRO_SOLUTION_DESIGN.md` is the solution design. It is local only (gitignored) because it changes often. If it is missing, ask Amr for the current copy. Read it completely before building.
- `CONTRACT.md` holds the event, question and rule schemas both builders code against. Once Amr marks it frozen, it changes only with his agreement.
- If the design is unclear or contradictory, ask Amr. Do not guess.

## Who owns what

| Builder | Scope |
|---|---|
| Claude Code | Migrations, screen sensor, Conductor, question planner, Work Map builder and validator, rule compiler and engine, evaluator, API routes, agent configuration, crawl worker |
| Codex | The screens, built from the Figma mock: tool recording and map review, session setup, capture side panel, debrief view, Work Map timeline, tutor view, mastery report, evaluation screen |

Do not edit the other builder's files. If you need a change there, ask Amr.

Screens read and write data only by calling route handlers under `/api`. They never talk to the database directly.

People sign in with an email and a password. An account has no role of its own: a role belongs to a workflow. Whoever creates a workflow is its expert, and the people the expert invites are its new hires. `GET /api/me` tells a screen who is signed in and which workflows they are on. Route handlers guard themselves with `requireUser` or `requireWorkflowRole` (`src/server/require-user.ts`).

The routes a screen can call, with their request and response shapes, are in `docs/API.md`.

## Rules

1. **Secrets stay on the server.** Never put a secret behind the `NEXT_PUBLIC_` prefix and never commit one. Names go in `.env.example`; values go in `.env.local` and in Vercel. Print names only, never values.
2. **All database access goes through route handlers.** Row-level security is on with no client policies. The only Supabase client is `src/server/supabase.ts`, and modules in `src/server/` import `server-only`. The answer key lives in the `evaluation` schema; only `src/app/api/evaluation/` may reach it, through `src/server/evaluation-db.ts`.
3. **Nothing specific to any workflow or tool in code or in a fixed prompt.** Tools, baselines, questions, steps and rules are data. Prompts are templates with variables.
4. **Every external call fails soft.** Wrap it in `failSoft` (`src/server/fail-soft.ts`). A timeout or error never breaks a session.
5. **Never modify the watched tool.** Crystal is a separate product. Tiro sees it only through screen share, the user's own scan, or a read-only crawl.
6. **Small commits, one change each.** `./scripts/gate.sh` must be green before every commit.
7. **Every fixed bug gets a test** before the fix is merged.
8. **Unsure whether something is in scope? Ask before building it.**

## Commands

```bash
npm run dev          # local server on http://localhost:3000
./scripts/gate.sh    # typecheck, lint, test, build
npm test             # unit tests only
```

Node 24 is pinned in `.nvmrc` and used by Vercel and CI.

## Layout

| Path | Content | Owner |
|---|---|---|
| `src/app/api/` | Route handlers | Claude Code |
| `src/server/` | Server-only modules: environment, database client, fail-soft, accounts and sign-in (`accounts.ts`, `require-user.ts`), workflows and their people (`workflows.ts`), model router (`models.ts`), frame reading (`vision/`), ElevenLabs session addresses and tokens (`elevenlabs.ts`) | Claude Code |
| `src/spikes/`, `scripts/spikes/` | Spike tooling that is not a page: scoring and replay | Claude Code |
| `src/contract/` | The contract as Zod schemas; import from here, change only via `CONTRACT.md` | Shared |
| `src/sensor/` | Screen sensor: frame diff, settle detection, capture | Claude Code |
| `src/app/spikes/` | Throwaway test pages for the Phase 1 spikes. Not product screens | Claude Code |
| `src/app/` (except `api/` and `spikes/`) | Pages and layouts | Codex |
| `supabase/migrations/` | Database schema. Apply with `npx supabase db push`, then `npm run types:db` | Claude Code |
| `agents/` | ElevenLabs agent configurations, prompts and client tools. Push with `npm run agents:push` | Claude Code |
| `scripts/`, `.github/` | Gate, CI, sign-up codes (`npm run signup-code`), demo accounts (`npm run demo-accounts`), agent push | Claude Code |
| `docs/spikes/` | Written spike results | Claude Code |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
