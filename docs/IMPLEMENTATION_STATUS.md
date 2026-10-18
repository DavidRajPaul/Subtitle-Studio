# Implementation Status

**Last updated:** 2026-10-19 · **Branch:** `main` · **Base commit:** `931ee43` (uncommitted Phase 0 work in the working tree)

## Current phase

**Phase 0 — Foundation:** Implemented — verification pending.
**Owner approval:** Pending. Phase 1 has **not** been started.

## What was completed (Phase 0)

- Backend skeleton: FastAPI app factory, env-based config (binds `127.0.0.1` by default), FFmpeg/FFprobe diagnostics.
- `GET /api/health` returns overall status plus FFmpeg/FFprobe availability, version or actionable detail. Tool calls use argument arrays only (no shell).
- Frontend skeleton: React + TypeScript + Vite, app shell, responsive single-column layout, semantic tokens, visible focus, 44 px touch targets.
- Diagnostics panel wired to the real backend, with loading, ready, needs-attention, unreachable and retry states.
- Root scripts: `backend`, `frontend`, `lint`, `typecheck`, `test`.
- Lint, type-check, test and build configuration for both halves.

No Phase 1+ functionality (file import, playback, TXT parsing, editor, transcription, export) is implemented.

## Key files

- `backend/app/{main,config,diagnostics,__init__}.py`, `backend/tests/test_health.py`, `backend/pyproject.toml`, `backend/uv.lock`
- `frontend/src/{App,main}.tsx`, `frontend/src/components/HealthPanel.tsx`, `frontend/src/api/health.ts`, `frontend/src/styles.css`, `frontend/src/App.test.tsx`, `frontend/src/test/setup.ts`
- `frontend/{package.json,pnpm-lock.yaml,tsconfig.json,vite.config.ts,eslint.config.js,index.html}`
- `package.json` (root scripts), `.gitignore`, `README.md` (phase table, run instructions, documentation links)

## Checks run and results

Environment: Node 22.22, pnpm 10.28, Python 3.13, uv 0.11, FFmpeg 6.1.1, Linux.

| Check | Command | Result |
|---|---|---|
| Backend lint | `uv run --directory backend ruff check .` | Pass |
| Backend format | `uv run --directory backend ruff format --check .` | Pass (6 files) |
| Backend types | `uv run --directory backend mypy` (strict) | Pass (6 files) |
| Backend tests | `uv run --directory backend pytest -q` | Pass — 4 passed, 1 deprecation warning (below) |
| Frontend lint | `pnpm --dir frontend lint` | Pass |
| Frontend types | `pnpm --dir frontend typecheck` | Pass |
| Frontend tests | `pnpm --dir frontend test` | Pass — 4 passed |
| Frontend build | `pnpm --dir frontend build` | Pass |
| Root scripts | `pnpm lint`, `pnpm typecheck`, `pnpm test` | Pass |
| Backend startup | `pnpm backend` | Pass — `/api/health` returned HTTP 200, status `ok`, both tools detected |
| Loopback bind | `/proc/net/tcp` after start | Pass — listening on `127.0.0.1:8000` only |
| Dev proxy | `pnpm frontend` + `curl 127.0.0.1:5173/api/health` | Pass — index HTTP 200, health proxied |
| Dependency audit | `pnpm audit` | Pass — no known vulnerabilities |

**Not run:**
- Real browser / visual inspection of the UI — not performed.
- Phone or touch testing, portrait/landscape, keyboard-only and screen-reader checks — not performed.
- Missing-FFmpeg path in a live browser — covered by a unit test only.
- Clean-install verification from a fresh clone — not performed (Phase 6).

## Decisions made (reversible, low-risk)

1. **Frontend package manager: pnpm.** npm failed to resolve the vitest 4 peer graph (internal arborist error). pnpm installs cleanly. Root scripts use pnpm.
2. **Dev tooling upgraded to patched releases:** `vite` 6.4.4 and `vitest` 4.1.12. The original `vite` 5 / `vitest` 2 carried 2 critical + 1 high + 3 moderate advisories. All were dev-only (`--omit=dev` reports zero). The suggested fix was a breaking major (vite 8 / vitest 5), which I did not take.
3. **Backend tooling in `backend/`:** uv + hatchling; ruff, mypy (strict), pytest.
4. **Health endpoint status:** `ok` when all tools are available, `degraded` otherwise (still HTTP 200, so the UI can explain the problem).
5. **Missing product/architecture docs:** the three README links (`PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `TECHNICAL_ARCHITECTURE.md`) are not in the repository. Their requirements are already covered by README, CLAUDE.md and the UX docs, so I did **not** recreate them. I changed the links to "not yet written." Owner may want them created later.
6. **No commit made.** `CLAUDE.md` and `docs/IMPLEMENTATION_PLAN.md` ask for a commit before advancing. The phase instructions prohibit commits unless explicitly requested. Changes are left in the working tree for owner review.

## Known limitations and unresolved decisions

- **Missing docs (owner decision):** create `PRODUCT_SPEC.md`, `ARCHITECTURE.md` and `TECHNICAL_ARCHITECTURE.md` now, or keep requirements in README/CLAUDE.md. Recommend: keep as-is until Phase 3, then consolidate.
- **Commit policy conflict:** `CLAUDE.md` and the plan say commit each phase; the phase protocol says no commits without request. Please confirm whether to commit Phase 0 (and under what message).
- **Dev-tool advisories fixed only within current majors.** Revisit when moving to vite 7+/vitest 5+ (dev-only exposure).
- **Starlette deprecation warning:** `TestClient` warns that `httpx` usage is deprecated in favour of `httpx2`. Non-blocking; revisit with a dependency update.
- **UX Phase A not done:** the Home screen's two workflow cards and the AppShell project header/save status are not built yet. The current page is a diagnostics shell only. These belong with Phase 1 (import), per the UX plan.
- **`docs/Test.md`:** a 1-byte file exists in the repo, not referenced anywhere. Left untouched; confirm whether to delete.
- **Owner-selected license:** still undecided (README). Dependency license review is a Phase 6 item.

## Next phase and prerequisites

**Phase 1 — Import and preview:** MP4 picker, FFprobe metadata, video playback and seeking, actionable validation errors.
Prerequisites: owner approval; a sample MP4 (with and without audio) for manual testing; agreement on the commit policy above.

## Approval status

**Pending.** Do not treat Phase 0 as accepted. Owner review checklist (phone-friendly):

1. Open the repo on GitHub or in a local checkout and confirm `README.md` shows Phase 0 as "verification pending".
2. On a desktop with pnpm, uv and FFmpeg: run `pnpm backend` then `pnpm frontend`, open http://127.0.0.1:5173. Diagnostics should show "Ready" with FFmpeg/FFprobe versions.
3. Stop FFmpeg from `PATH` (or set `SUBTITLE_STUDIO_FFMPEG` to a bad path), restart, and confirm a clear "Missing" message with a retry.
4. Phone check: the backend binds to `127.0.0.1` only, so the app cannot be opened on a phone directly. Until a phone-reachable test setup is agreed, use the desktop browser's responsive/mobile mode to confirm the single-column layout and 44 px buttons. A real phone test has **not** been performed.
5. Decide the open items above, then reply "Approved. Proceed to Phase 1" or describe changes.

PHASE GATE: I will not begin the next phase until you explicitly approve it. Reply "Approved. Proceed to Phase 1" to continue, or tell me what you want changed. If I need anything from you before continuing, I will state it explicitly.
