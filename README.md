# @trebired/update

Generic update runtime for distributed binaries and packages, with strict manifest normalization, signature verification, artifact verification, resumable downloads, staging, activation, rollback, persistence helpers, polling, and controller-managed rollout primitives.

`@trebired/update` is intentionally product-agnostic.

It does not know about any specific repository, deployment system, service manager, transport, or UI. It provides reusable update building blocks plus a few strong high-level flows.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/update
```

## Layers

The package now exposes three adoption levels:

- low-level primitives
- self-managed high-level flows
- controller-managed multi-target rollout

Release channels are accepted as optional legacy metadata, but they are no longer required by the new core runtime, manifest, selection, or persisted-state flows.

## Self-Managed Flow

Use `checkForUpdate`, `prepareUpdate`, `applyPreparedUpdate`, `applyUpdate`, `resumeUpdate`, and `createUpdateScheduler` when the updating process owns its own lifecycle:

```ts
import { applyUpdate, createFileUpdateJournalStore, createFileUpdateStateStore } from "@trebired/update";

const workingDirectory = "/var/lib/entity/update";

const result = await applyUpdate({
  entity: "primary",
  currentVersion: "1.4.0",
  os: process.platform,
  arch: process.arch,
  installStrategy: "raw",
  manifestUrl: "manifest:primary",
  workingDirectory,
  verificationKeys: [process.env.UPDATE_PUBLIC_KEY_PEM!],
  activationTarget: {
    livePath: "/opt/entity/bin/current",
  },
  stateStore: createFileUpdateStateStore({
    directory: workingDirectory,
  }),
  journalStore: createFileUpdateJournalStore({
    directory: workingDirectory,
  }),
  lifecycleHandler: (event) => {
    console.log(event.type, event.operationId);
  },
});

if (result.restartPending) {
  // defer restart until your product decides to complete activation
}
```

Built-in scheduler support is available when consumers want polling without custom timer glue:

```ts
import { createUpdateScheduler } from "@trebired/update";

const scheduler = createUpdateScheduler({
  entity: "primary",
  currentVersion: "1.4.0",
  os: process.platform,
  arch: process.arch,
  installStrategy: "raw",
  manifestUrl: "manifest:primary",
  workingDirectory: "/var/lib/entity/update",
  verificationKeys: [process.env.UPDATE_PUBLIC_KEY_PEM!],
  intervalMs: 60_000,
  mode: "check",
  onError: (error) => {
    console.error(error.message);
  },
});

scheduler.start();
```

`start()` runs one check immediately, then polls on the configured interval. Scheduled runs are single-flight, interval timers are unref'd by default, and background errors are swallowed after `onError` is called. `triggerNow()` still returns the run promise for callers that want to handle success or failure directly.

## Controller-Managed Rollout

Use rollout planning and instruction helpers when a controller chooses artifacts for many targets while transports stay outside the library:

```ts
import {
  createRolloutInstructions,
  planRollout,
  summarizeRollout,
} from "@trebired/update";

const plan = await planRollout({
  manifestUrl: "manifest:secondary",
  verificationKeys: [process.env.UPDATE_PUBLIC_KEY_PEM!],
  targets: [
    {
      targetId: "target-1",
      subject: {
        entity: "secondary",
        currentVersion: "1.0.0",
        os: "linux",
        arch: "x64",
        installStrategy: "raw",
      },
    },
  ],
});

const instructions = createRolloutInstructions({
  instructionSigner: process.env.UPDATE_PRIVATE_KEY_PEM!,
  manifest: plan.manifest,
  plans: plan.targets,
});

const summary = summarizeRollout({
  instructions,
  plan,
});
```

Delivery, acknowledgement collection, and apply-result collection are transport interfaces. The library defines the contracts but does not ship a transport.

## Core Primitives

Low-level consumers can compose the runtime directly:

```ts
import {
  activateStagedArtifact,
  checkForUpdate,
  createFileUpdateLockStore,
  downloadArtifact,
  executePackageInstall,
  fetchManifestFromSources,
  selectArtifactForSubject,
  stageArtifact,
  verifyDownloadedArtifact,
  verifyUpdateInstruction,
  withUpdateLock,
} from "@trebired/update";
```

Key capabilities:

- fallback manifest sources
- generic JSON manifest fetch with shared fetch/auth/signature handling
- optional channel-aware legacy selection plus channel-free core selection
- resumable downloads and artifact mirrors
- file-backed state, journal, and locking helpers
- package install execution for `deb` and `rpm`
- restart/deferred-activation hooks
- update instruction creation and verification
- batch rollout planning and summary types

## Compatibility, Counterparts, Fleet State, and Resources

Compatibility sets describe exact certified combinations. They are explicit released combinations, not semver ranges:

```ts
import {
  compatibilityKey,
  findCombination,
  isCombinationReleased,
  normalizeCompatibilitySet,
} from "@trebired/update";

const set = normalizeCompatibilitySet({
  combinations: [{
    versions: {
      "entity-a": "1.0.0",
      "entity-b": "2.0.0",
    },
    resources: {
      schema: {
        version: "4.0.0",
        fileName: "schema.zip",
        checksum: { type: "sha256", value: "..." },
      },
    },
  }],
});

const combination = findCombination(set, { "entity-a": "1.0.0" });
const key = combination ? compatibilityKey(combination) : null;
const released = isCombinationReleased(set, { "entity-a": "1.0.0", "entity-b": "2.0.0" });
```

Installed builds can embed counterpart expectations and enforce them offline:

```ts
import {
  assertCounterpart,
  readCounterpartExpectations,
} from "@trebired/update";

const expected = readCounterpartExpectations(config, {
  fieldPaths: {
    "entity-b": "release.entityBVersion",
  },
});

assertCounterpart({
  selfEntity: "entity-a",
  selfVersion: "1.0.0",
  expected,
  reported: {
    "entity-b": reportedEntityBVersion,
  },
});
```

Fleet classification is exact and order-independent:

```ts
import { classifyFleet, classifySubject } from "@trebired/update";

const status = classifySubject({
  reported: "1.0.0",
  expected: "1.0.0",
  target: "1.1.0",
});

const fleet = classifyFleet(subjects, {
  expected: { "entity-b": "2.0.0" },
  target: { "entity-b": "2.1.0" },
});

console.log(status.status, fleet.signature);
```

Resource manifests and bundles distribute versioned non-executable payloads attached to a combination. Bundle installation downloads, verifies SHA-256, extracts with traversal protection, optionally validates staging contents, replaces the target directory, and writes installed metadata:

```ts
import {
  fetchResourceManifest,
  installResourceBundle,
  readInstalledResourceMeta,
  selectResourceEntry,
} from "@trebired/update";

const manifest = await fetchResourceManifest("manifest:resources", {
  verificationKeys: [publicKey],
});

const entry = selectResourceEntry(manifest.manifest, {
  combination: { "entity-a": "1.0.0", "entity-b": "2.0.0" },
  resource: "schema",
});

await installResourceBundle({
  url: entry.url,
  checksum: entry.checksum,
  key: entry.key,
  version: entry.version,
  workingDirectory,
  targetDirectory,
  validate: async (stagingDir) => {
    await ensureExpectedFiles(stagingDir);
  },
});

const meta = await readInstalledResourceMeta(targetDirectory);
```

## Compatibility Helpers

The previous surface remains available for incremental migration:

- `fetchManifest`
- `selectArtifact`
- `planSelfUpdate`
- `applySelfUpdate`
- `planSecondaryUpdate`
- `createSecondaryUpdateInstruction`
- `verifySecondaryUpdateInstruction`
- `applySecondaryUpdate`
- `createUpdateClient`

These helpers now wrap the newer primitives and flows. Legacy channel-aware behavior remains available through those wrappers when a consumer still depends on it.

## Security Defaults

- invalid manifest signatures are rejected
- invalid instruction signatures are rejected
- invalid SHA-256 checksums are rejected
- archive traversal is rejected
- resource bundle checksum mismatches are rejected
- resource bundle installs replace prior target contents and refresh installed metadata
- expired instructions are rejected
- minimum supported version rules are enforced consistently during planning and applying
- duplicate concurrent check and apply executions can be locked out
- rollback state is preserved before staged binary replacement

## Public API

High-level flows:

- `checkForUpdate`
- `prepareUpdate`
- `applyPreparedUpdate`
- `applyUpdate`
- `resumeUpdate`
- `createUpdateScheduler`

Controller rollout:

- `planRollout`
- `createRolloutInstructions`
- `deliverRolloutInstructions`
- `collectRolloutAcknowledgements`
- `collectRolloutResults`
- `summarizeRollout`

Persistence and locking:

- `createFileUpdateStateStore`
- `createFileUpdateJournalStore`
- `createFileUpdateLockStore`
- `withUpdateLock`

Instruction and evaluation primitives:

- `createUpdateInstruction`
- `verifyUpdateInstruction`
- `evaluateUpdateCandidate`
- `fetchJsonManifest`
- `normalizeCompatibilitySet`
- `compatibilityKey`
- `parseCompatibilityKey`
- `findCombination`
- `isCombinationReleased`
- `readCounterpartExpectations`
- `evaluateCounterpart`
- `assertCounterpart`
- `classifySubject`
- `classifyFleet`
- `fetchManifestFromSources`
- `selectArtifactForSubject`

Download, install, and activation primitives:

- `downloadArtifact`
- `verifyDownloadedArtifact`
- `fetchResourceManifest`
- `normalizeResourceManifest`
- `selectResourceEntry`
- `installResourceBundle`
- `readInstalledResourceMeta`
- `stageArtifact`
- `executePackageInstall`
- `activateStagedArtifact`
- `rollbackActivatedArtifact`
