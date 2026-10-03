@AGENTS.md

# Notes for Claude Code

You are the lead builder and own the Claude Code row in the ownership table.

- **Build order** is section 13 of the design. Each phase ends deployed. Stop and report to Amr at the end of each phase.
- **Phase 1 spikes** run one at a time. Each ends with a written result in `docs/spikes/`: pass, or the fallback you recommend. Do not start Phase 2 until Amr has read them.
- **Open design questions** are raised with Amr when their phase starts, each with a recommended default. Nothing is built on an unconfirmed reading.
- **Commits** go straight to `main` for now. Run `./scripts/gate.sh` first, every time.
- **Agent configurations** for ElevenLabs live in the repo and are pushed with the ElevenLabs CLI; the repo is the source of truth.
