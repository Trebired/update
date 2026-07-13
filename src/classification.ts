import { stableJsonStringify } from "#canonical";
import { compareVersions } from "#verify";
import type {
  ClassifiedFleet,
  ClassifiedFleetSubject,
  ClassifyFleetCriteria,
  ClassifySubjectInput,
  SubjectClassification,
  SubjectClassificationStatus,
  UpdateRuntimeTarget,
} from "#types";

export function classifySubject(input: ClassifySubjectInput): SubjectClassification {
  const reported = normalizeOptionalVersion(input.reported);
  const expected = normalizeOptionalVersion(input.expected);
  const target = normalizeOptionalVersion(input.target);

  if (!reported) {
    return { status: "unknown" };
  }

  if (expected && reported !== expected) {
    return { status: "incompatible" };
  }

  if (target && compareVersions(reported, target) < 0) {
    return { status: "outdated" };
  }

  return { status: "current" };
}

export function classifyFleet(subjects: UpdateRuntimeTarget[], criteria: ClassifyFleetCriteria): ClassifiedFleet {
  const all = subjects.map((subject) => {
    const expected = criteria.expected?.[subject.entity] ?? null;
    const target = criteria.target?.[subject.entity] ?? null;
    const reported = normalizeOptionalVersion(subject.currentVersion);
    const { status } = classifySubject({
      expected,
      reported,
      target,
    });

    return {
      subject,
      status,
      reported,
      target: normalizeOptionalVersion(target),
      expected: normalizeOptionalVersion(expected),
    };
  });

  return {
    all,
    byStatus: groupByStatus(all),
    signature: stableJsonStringify(all
      .map((entry) => ({
        arch: entry.subject.arch,
        channel: entry.subject.channel ?? null,
        entity: entry.subject.entity,
        expected: entry.expected ?? null,
        installStrategy: entry.subject.installStrategy,
        os: entry.subject.os,
        reported: entry.reported ?? null,
        status: entry.status,
        target: entry.target ?? null,
      }))
      .sort((left, right) => stableJsonStringify(left).localeCompare(stableJsonStringify(right)))),
  };
}

function groupByStatus(all: ClassifiedFleetSubject[]): Record<SubjectClassificationStatus, ClassifiedFleetSubject[]> {
  return {
    current: all.filter((entry) => entry.status === "current"),
    outdated: all.filter((entry) => entry.status === "outdated"),
    incompatible: all.filter((entry) => entry.status === "incompatible"),
    unknown: all.filter((entry) => entry.status === "unknown"),
  };
}

function normalizeOptionalVersion(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
