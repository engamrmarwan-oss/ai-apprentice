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

## Rules

1. **Secrets stay on the server.** Never put a secret behind the `NEXT_PUBLIC_` prefix and never commit one. Names go in `.env.example`; values go in `.env.local` and in Vercel. Print names only, never values.
2. **All database access goes through route handlers.** Row-level security is on with no client policies. The only Supabase client is `src/server/supabase.ts`, and modules in `src/server/` import `server-only`.
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
| `src/server/` | Server-only modules: environment, database client, fail-soft | Claude Code |
| `src/app/` (except `api/`) | Pages and layouts | Codex |
| `scripts/`, `.github/` | Gate and CI | Claude Code |
| `docs/spikes/` | Written spike results | Claude Code |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
