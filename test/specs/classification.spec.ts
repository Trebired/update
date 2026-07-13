import { describe, expect, test } from "bun:test";

import { classifyFleet, classifySubject } from "#index";
import type { UpdateRuntimeTarget } from "#types";

describe("fleet classification", () => {
  test("classifies unknown, incompatible, outdated, and current subjects", () => {
    expect(classifySubject({ reported: "" }).status).toBe("unknown");
    expect(classifySubject({ reported: "1.0.0", expected: "2.0.0" }).status).toBe("incompatible");
    expect(classifySubject({ reported: "1.0.0", target: "2.0.0" }).status).toBe("outdated");
    expect(classifySubject({ reported: "2.0.0", target: "2.0.0" }).status).toBe("current");
  });

  test("groups subjects and produces an order-independent signature", () => {
    const subjects: UpdateRuntimeTarget[] = [
      createSubject("entityB", "1.0.0"),
      createSubject("entityA", "2.0.0"),
      createSubject("entityC", ""),
    ];
    const criteria = {
      expected: {
        entityA: "2.0.0",
        entityB: "1.0.0",
      },
      target: {
        entityA: "2.0.0",
        entityC: "1.0.0",
        entityB: "1.1.0",
      },
    };

    const first = classifyFleet(subjects, criteria);
    const second = classifyFleet([...subjects].reverse(), criteria);

    expect(first.byStatus.current.map((entry) => entry.subject.entity)).toEqual(["entityA"]);
    expect(first.byStatus.outdated.map((entry) => entry.subject.entity)).toEqual(["entityB"]);
    expect(first.byStatus.unknown.map((entry) => entry.subject.entity)).toEqual(["entityC"]);
    expect(first.signature).toBe(second.signature);
  });
});

function createSubject(entity: string, currentVersion: string): UpdateRuntimeTarget {
  return {
    entity,
    currentVersion,
    os: "linux",
    arch: "x64",
    installStrategy: "raw",
  };
}
