# Changelog

All notable changes to `@trebired/update` will be documented here.

This project follows semantic versioning once published.

## 1.0.11

- Updated the Code Discipline devDependency and lockfile to public `@trebired/code-discipline@^5.5.2`.
- Fixed the public runtime barrel export so packed Node ESM consumers import an emitted file instead of a directory.

## 1.0.10

- Adopted the shared Trebired Code Discipline preset so package configs only keep repo-specific policy.
- Updated the Code Discipline devDependency and lockfile to public `@trebired/code-discipline@^5.5.1`.

## 1.0.9

- Updated the package Code Discipline config to the platform-aligned rule set, including formatting, redundant path segment cleanup, removable comment checks, structural blank lines, and dry checks.
- Updated the Code Discipline devDependency and lockfile to the current public `@trebired/code-discipline@^5.3.0`.

## 1.0.8

- Refreshed package dependency ranges and lockfile state with `bun update` after adopting the `.trebired/code-discipline` structure.

## 1.0.7

- Moved Code Discipline config, alias-map state, generated tsconfig paths, and reports to `.trebired/code-discipline/`.
- Updated the `@trebired/code-discipline` devDependency to `^4.10.0`.

## 1.0.6

- Updated Code Discipline configuration to the `imports` rule with dead import removal enabled.
- Updated update log group metadata fallback so package-owned logs stay under the organization root when package metadata is unavailable.
- Updated internal package dependency ranges to the current published sibling releases.

## 1.0.5

- Fixed a broken published-package build: a fresh checkout has no committed `.code-discipline/generated/` output, and nothing regenerated it before `typecheck`/`build`, so every internal `#hash` import failed to resolve. `typecheck` and `build` now run `prepare:generated` first.
- Standardized package metadata (author field, config-driven organization name, dropped the Node engine constraint) and migrated `.code-discipline/config.ts` to `defineCodeDisciplineConfig`.
- Normalized README structure and removed the license footer.
- Updated the `@trebired/code-discipline` devDependency to 4.8.0.

## 1.0.4

- Standardized package metadata ordering and contributing guidance around the Trebired writing style.
- Added package-owned organization metadata and derived update lifecycle log groups from `package.json`.
- Updated internal package dependency ranges to the current sibling package releases.

## 1.0.3

- Removed dead test scripts and stale test commands from publish workflows and maintainer docs.

## 1.0.2

- Removed package test suites and banned committed `*.spec.ts`/`*.spec.tsx` files through Code Discipline.
- Added Code Discipline enforcement for hardcoded `trebired` strings outside package metadata.
- Migrated Code Discipline to `.code-discipline/config.ts` with alias-map sync output.
- Updated package-generated artifact ignores and internal package dependency ranges.

## 1.0.1

- Moved package-owned update lifecycle status logging under the `trebired.update` group root.

## 1.0.0

- add exact compatibility sets with deterministic keys, partial lookup, membership checks, alias-aware normalization, and optional signature verification
- add offline counterpart expectation reading, evaluation, and structured mismatch errors for caller-owned boot gates
- add subject and fleet classification helpers with order-independent fleet signatures
- add signed resource manifests and checksum-verified non-executable resource bundle installation with traversal guards, replace semantics, and installed metadata
- add generic JSON manifest fetching with shared fetch/auth/signature handling
- extend the scheduler start loop with immediate single-flight polling, unref'd timers, and handled background errors

## 0.2.1

- adopt `@trebired/result` as the internal update-runtime outcome surface for touched lifecycle and backend communication flows instead of package-local result wrappers
- enforce current `@trebired/code-discipline` expectations on the touched integration paths while keeping the public rollout and client APIs unchanged

## 0.2.0

- Added a layered runtime surface with shared primitives, self-managed flows, and controller-managed rollout APIs.
- Made release channels optional legacy metadata in the core manifest, artifact selection, runtime subject, and persisted-state model.
- Added built-in lifecycle events, file-backed state and journal helpers, and locking helpers for idempotent check and apply flows.
- Added fallback manifest source resolution, artifact mirrors, and resumable download checkpoints.
- Added package-install execution support for `deb` and `rpm`, plus restart deferral hooks and built-in scheduler support.
- Added generic rollout planning, instruction creation, delivery and acknowledgement abstractions, apply result collection, and aggregate batch summaries.
- Kept the previous `fetchManifest`, `selectArtifact`, `plan*`, `apply*`, and `createUpdateClient` APIs as compatibility wrappers over the new runtime.

## 0.1.0

- Initial generic `@trebired/update` release with manifest verification, artifact selection, download, staging, activation, rollback, and primary-managed secondary orchestration primitives.
