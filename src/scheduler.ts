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

  const scheduleNext = () => {
    if (!state.running) {
      return;
    }

    timer = setTimeout(() => {
      void runOnce().finally(scheduleNext);
    }, input.intervalMs);
  };

  const runOnce = async () => {
    if (running && activeRun) {
      return activeRun;
    }

    running = true;
    state.lastStartedAt = new Date().toISOString();
    activeRun = (input.mode ?? "check") === "apply"
      ? applyUpdate({
        ...input,
        lockKey: input.lockKey,
        operationId: input.operationIdFactory?.() ?? randomUUID(),
      })
      : checkForUpdate({
        ...input,
        lockKey: input.lockKey,
        operationId: input.operationIdFactory?.() ?? randomUUID(),
      });

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
      running = false;
      activeRun = null;
    }
  };

  return {
    getState() {
      return {
        ...state,
        running,
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
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    triggerNow() {
      return runOnce();
    },
  };
}
