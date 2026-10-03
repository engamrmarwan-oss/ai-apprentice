# Tiro

Tiro is an apprentice that watches an expert work in any tool, asks why at the right moments, turns what it learned into a Work Map, and teaches it to a new hire.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
./scripts/gate.sh    # typecheck, lint, test, build — run before every commit
```

Node 24 is pinned in `.nvmrc`. Environment variable names are listed in `.env.example`; values go in `.env.local`, which is never committed.

## Where things are

- `AGENTS.md` — project rules and ownership, read by every coding agent.
- `CLAUDE.md` — additions for Claude Code.
- `CONTRACT.md` — event, question and rule schemas shared between builders.
