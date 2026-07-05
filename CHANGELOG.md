# Changelog

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
