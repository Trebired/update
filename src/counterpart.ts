import type {
  AssertCounterpartOptions,
  CounterpartExpectationPaths,
  EvaluateCounterpartInput,
  EvaluateCounterpartResult,
  ReadCounterpartExpectationsOptions,
} from "#types";

export class CounterpartMismatchError extends Error {
  readonly selfEntity: string;
  readonly selfVersion: string;
  readonly mismatches: EvaluateCounterpartResult["mismatches"];

  constructor(input: {
    selfEntity: string;
    selfVersion: string;
    mismatches: EvaluateCounterpartResult["mismatches"];
  }) {
    super(`Counterpart mismatch for entity ${input.selfEntity} at version ${input.selfVersion}.`);
    this.name = "CounterpartMismatchError";
    this.selfEntity = input.selfEntity;
    this.selfVersion = input.selfVersion;
    this.mismatches = input.mismatches;
  }
}

export function readCounterpartExpectations(config: unknown, options: CounterpartExpectationPaths | ReadCounterpartExpectationsOptions): Record<string, string> {
  const paths = "fieldPaths" in options ? options.fieldPaths : options;
  return Object.fromEntries(Object.entries(paths).flatMap(([entity, path]) => {
    const value = readPath(config, Array.isArray(path) ? path : path.split("."));
    return typeof value === "string" && value.length > 0
      ? [[entity, value]]
      : [];
  }));
}

export function evaluateCounterpart(input: EvaluateCounterpartInput): EvaluateCounterpartResult {
  const treatUnknownAsCompatible = input.treatUnknownAsCompatible ?? true;
  const mismatches = Object.entries(input.expected).flatMap(([entity, expected]) => {
    const reported = input.reported[entity];
    const normalizedReported = typeof reported === "string" && reported.length > 0 ? reported : null;

    if (normalizedReported == null && treatUnknownAsCompatible) {
      return [];
    }

    if (normalizedReported !== expected) {
      return [{
        entity,
        expected,
        reported: normalizedReported,
      }];
    }

    return [];
  });

  return {
    compatible: mismatches.length === 0,
    mismatches,
  };
}

export function assertCounterpart(input: EvaluateCounterpartInput, options: AssertCounterpartOptions = {}): void {
  const result = evaluateCounterpart({
    ...input,
    treatUnknownAsCompatible: options.treatUnknownAsCompatible ?? input.treatUnknownAsCompatible,
  });
  if (!result.compatible) {
    throw new CounterpartMismatchError({
      selfEntity: input.selfEntity,
      selfVersion: input.selfVersion,
      mismatches: result.mismatches,
    });
  }
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;

  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
