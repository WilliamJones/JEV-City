# JEV City — Phase 0 handoff to Claude Code

Prepared 2026-10-13. These artifacts are a **proposed, implementation-ready handoff**, not a verified live integration or measured benchmark.

## Files

- `PRD.md` — 25-citizen, three-scenario MVP requirements and explicit pass/fail criteria.
- `JEV-DECISION-CONTRACT.md` — canonical direct-TypeSafe request/response shape, proposed JEV City decision semantics, internal DTO, and proxy controls.
- `VISUAL-DIRECTION.md` — scene composition, tokens, lighting, character design and responsive UI.
- `fixtures/jev-request.example.json` — valid example direct-TypeSafe request body, with proposed citizen state.
- `fixtures/jev-response.synthetic.json` — **synthetic** response structure for parser tests only; not measured, observed, or suitable for public KPI displays.

## Start here

1. Review/challenge the action eligibility gates, choice sampling, deterministic-world assumptions and security model.
2. Implement **Phase 0 only**: confirm official TypeSafe key/access, smoke-test raw response against the strict contract, create decision/adapters and budget/limit test doubles, and capture first real timings and token usage.
3. Send architecture objections and actual test results to product/architecture review. No visuals beyond a minimal decision inspector before the Go/No-Go decision.

## Evidence and direct docs

- Direct TypeSafe API: https://docs.typesafe.ai/api
- Model pin and current limits: https://docs.typesafe.ai/models
- Three primitives: https://docs.typesafe.ai/primitives
- Vercel shared Redis: https://vercel.com/docs/redis

**No repository was changed by generating these files.** Add them to your Git checkout after review.
