import type {
  BatchRolloutResult,
  SummarizeRolloutInput,
} from "#kn5mninc2td8";

type RolloutSummaryTarget = BatchRolloutResult["targets"][number];

function summarizeRollout(input: SummarizeRolloutInput): BatchRolloutResult {
  const indexes = createRolloutSummaryIndexes(input);
  const targets = input.plan.targets.map((target) =>
    summarizeRolloutTarget(target, indexes),
  );

  return {
    rolloutId: input.plan.rolloutId,
    summary: countRolloutTargets(targets),
    targets,
  };
}

function createRolloutSummaryIndexes(input: SummarizeRolloutInput) {
  return {
    acknowledgementByInstruction: new Map(
      (input.acknowledgements ?? []).map((ack) => [ack.instructionId, ack]),
    ),
    deliveryByInstruction: new Map(
      (input.deliveries ?? []).map((delivery) => [
          delivery.instructionId,
          delivery,
      ]),
    ),
    instructionByTarget: new Map(
      (input.instructions ?? []).map((instruction) => [
          instruction.targetId ?? instruction.targetInstanceId!,
          instruction,
      ]),
    ),
    resultByInstruction: new Map(
      (input.results ?? []).map((result) => [result.instructionId, result]),
    ),
  };
}

function summarizeRolloutTarget(
  target: SummarizeRolloutInput["plan"]["targets"][number],
  indexes: ReturnType<typeof createRolloutSummaryIndexes>,
): RolloutSummaryTarget {
  const instruction = indexes.instructionByTarget.get(target.targetId);
  const delivery = instruction
  ? indexes.deliveryByInstruction.get(instruction.instructionId)
  : undefined;
  const acknowledgement = instruction
  ? indexes.acknowledgementByInstruction.get(instruction.instructionId)
  : undefined;
  const result = instruction
  ? indexes.resultByInstruction.get(instruction.instructionId)
  : undefined;

  return {
    acknowledgementStatus: resolveAcknowledgementStatus(acknowledgement?.status, Boolean(instruction)),
    applyStatus: result?.status,
    deliveryStatus: resolveDeliveryStatus(delivery?.delivered),
    instructionId: instruction?.instructionId,
    planningStatus: target.status,
    reason: target.reason,
    targetId: target.targetId,
  };
}

function resolveAcknowledgementStatus(
  status: RolloutSummaryTarget["acknowledgementStatus"],
  hasInstruction: boolean,
) {
  return status ?? (hasInstruction ? "missing" : undefined);
}

function resolveDeliveryStatus(delivered: boolean | undefined) {
  if (delivered === undefined) {
    return undefined;
  }

  return delivered ? "delivered" : "not-delivered";
}

function countRolloutTargets(targets: RolloutSummaryTarget[]) {
  return {
    acknowledged: targets.filter(
      (target) => target.acknowledgementStatus === "acknowledged",
    ).length,
    applied: targets.filter((target) => target.applyStatus === "applied").length,
    blocked: targets.filter((target) => target.planningStatus === "blocked").length,
    delivered: targets.filter((target) => target.deliveryStatus === "delivered").length,
    failed: targets.filter((target) => target.applyStatus === "failed").length,
    noUpdate: targets.filter((target) => target.planningStatus === "no-update").length,
    pending: targets.filter((target) => target.applyStatus === "pending").length,
    ready: targets.filter((target) => target.planningStatus === "ready").length,
    rolledBack: targets.filter((target) => target.applyStatus === "rolled-back").length,
    selectionFailed: targets.filter(
      (target) => target.planningStatus === "selection-failed",
    ).length,
    total: targets.length,
  };
}

export {
  summarizeRollout,
};
