import { randomUUID } from "node:crypto";

import { applyUpdate, checkForUpdate } from "#runtime";
import type {
  AppliedUpdateResult,
  UpdateCheckResult,
  UpdateScheduler,
  UpdateSchedulerConfig,
  UpdateSchedulerState,
} from "#types";

export function createUpdateScheduler(input: UpdateSchedulerConfig): UpdateScheduler {
  let timer: Timer | null = null;
  let running = false;
  let activeRun: Promise<AppliedUpdateResult | UpdateCheckResult> | null = null;
  const state: UpdateSchedulerState = {
    running: false,
  };

  const scheduleNext = () => queueNextRun(input.intervalMs, state, () => {
    timer = setTimeout(() => {
      void runOnce().finally(scheduleNext);
    }, input.intervalMs);
  });
  const runOnce = () => executeScheduledRun(input, state, {
    get activeRun() {
      return activeRun;
    },
    get running() {
      return running;
    },
    setActiveRun(value) {
      activeRun = value;
    },
    setRunning(value) {
      running = value;
    },
  });

  return createSchedulerApi(state, runOnce, scheduleNext, () => timer, (value) => {
    timer = value;
  }, () => running);
}

function createScheduledRun(input: UpdateSchedulerConfig) {
  const runtimeInput = {
    ...input,
    lockKey: input.lockKey,
    operationId: input.operationIdFactory?.() ?? randomUUID(),
  };

  return (input.mode ?? "check") === "apply"
    ? applyUpdate(runtimeInput)
    : checkForUpdate(runtimeInput);
}

function queueNextRun(intervalMs: number, state: UpdateSchedulerState, schedule: () => void) {
  if (!state.running) {
    return;
  }

  schedule();
}

function createSchedulerApi(
  state: UpdateSchedulerState,
  runOnce: () => Promise<AppliedUpdateResult | UpdateCheckResult>,
  scheduleNext: () => void,
  readTimer: () => Timer | null,
  writeTimer: (value: Timer | null) => void,
  readRunning: () => boolean,
): UpdateScheduler {
  return {
    getState() {
      return {
        ...state,
        running: readRunning(),
      };
    },
    start() {
      if (state.running) {
        return;
      }

      state.running = true;
      void runOnce().finally(scheduleNext);
    },
    stop() {
      state.running = false;
      const timer = readTimer();
      if (!timer) {
        return;
      }

      clearTimeout(timer);
      writeTimer(null);
    },
    triggerNow() {
      return runOnce();
    },
  };
}

async function executeScheduledRun(
  input: UpdateSchedulerConfig,
  state: UpdateSchedulerState,
  control: {
    activeRun: Promise<AppliedUpdateResult | UpdateCheckResult> | null;
    running: boolean;
    setActiveRun(value: Promise<AppliedUpdateResult | UpdateCheckResult> | null): void;
    setRunning(value: boolean): void;
  },
) {
  if (control.running && control.activeRun) {
    return control.activeRun;
  }

  control.setRunning(true);
  state.lastStartedAt = new Date().toISOString();
  const activeRun = createScheduledRun(input);
  control.setActiveRun(activeRun);

  try {
    const result = await activeRun;
    state.lastError = undefined;
    state.lastFinishedAt = new Date().toISOString();
    state.lastResult = result;
    return result;
  }
  catch (error) {
    state.lastError = error instanceof Error ? error : new Error(String(error));
    state.lastFinishedAt = new Date().toISOString();
    throw error;
  }
  finally {
    control.setRunning(false);
    control.setActiveRun(null);
  }
}
