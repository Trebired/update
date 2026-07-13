import { describe, expect, test } from "bun:test";

import {
  assertCounterpart,
  compatibilityKey,
  CounterpartMismatchError,
  evaluateCounterpart,
  findCombination,
  isCombinationReleased,
  normalizeCompatibilitySet,
  parseCompatibilityKey,
  readCounterpartExpectations,
} from "#index";

describe("compatibility sets", () => {
  registerCompatibilityKeyTest();
  registerCompatibilityLookupTest();
  registerCompatibilityAmbiguityTest();
});

describe("counterpart expectations", () => {
  registerCounterpartEvaluationTest();
  registerCounterpartAssertTest();
});

function registerCompatibilityKeyTest() {
  test("derives deterministic keys and parses them back", () => {
    const key = compatibilityKey({
      versions: {
        "entity/b": "2.0.0~beta",
        entityA: "1.0.0",
      },
    });

    expect(key).toBe("entity%2Fb=2.0.0%7Ebeta~entityA=1.0.0");
    expect(parseCompatibilityKey(key)).toEqual({
      "entity/b": "2.0.0~beta",
      entityA: "1.0.0",
    });
  });
}

function registerCompatibilityLookupTest() {
  test("finds unique partial matches and returns null for none", () => {
    const set = normalizeCompatibilitySet({
      combinations: [
        {
          versions: {
            entityA: "1.0.0",
            entityB: "2.0.0",
          },
        },
        {
          versions: {
            entityA: "1.1.0",
            entityB: "2.1.0",
          },
        },
      ],
    });

    expect(findCombination(set, { entityA: "1.0.0" })?.versions.entityB).toBe("2.0.0");
    expect(findCombination(set, { entityA: "9.0.0" })).toBeNull();
    expect(isCombinationReleased(set, {
      entityB: "2.1.0",
      entityA: "1.1.0",
    })).toBe(true);
  });
}

function registerCompatibilityAmbiguityTest() {
  test("rejects ambiguous partial matches", () => {
    const set = normalizeCompatibilitySet({
      combinations: [
        { versions: { entityA: "1.0.0", entityB: "2.0.0" } },
        { versions: { entityA: "1.0.0", entityB: "2.1.0" } },
      ],
    });

    expect(() => findCombination(set, { entityA: "1.0.0" })).toThrow(/multiple/i);
  });
}

function registerCounterpartEvaluationTest() {
  test("reads configured paths and treats unknown reports as compatible by default", () => {
    const expected = readCounterpartExpectations({
      release: {
        entityA: "1.0.0",
        entityB: {
          version: "2.0.0",
        },
      },
    }, {
      entityA: "release.entityA",
      entityB: ["release", "entityB", "version"],
    });

    expect(expected).toEqual({
      entityA: "1.0.0",
      entityB: "2.0.0",
    });
    expect(evaluateCounterpart({
      selfEntity: "entityA",
      selfVersion: "1.0.0",
      expected,
      reported: {
        entityA: "1.0.0",
      },
    })).toEqual({
      compatible: true,
      mismatches: [],
    });
  });
}

function registerCounterpartAssertTest() {
  test("assertCounterpart throws a structured mismatch error", () => {
    expect(() => assertCounterpart({
      selfEntity: "entityA",
      selfVersion: "1.0.0",
      expected: {
        entityB: "2.0.0",
      },
      reported: {
        entityB: "2.1.0",
      },
    })).toThrow(CounterpartMismatchError);

    try {
      assertCounterpart({
        selfEntity: "entityA",
        selfVersion: "1.0.0",
        expected: {
          entityB: "2.0.0",
        },
        reported: {
          entityB: "",
        },
        treatUnknownAsCompatible: false,
      });
    }
    catch (error) {
      expect(error).toBeInstanceOf(CounterpartMismatchError);
      expect((error as CounterpartMismatchError).selfEntity).toBe("entityA");
      expect((error as CounterpartMismatchError).selfVersion).toBe("1.0.0");
      expect((error as CounterpartMismatchError).mismatches).toEqual([{
        entity: "entityB",
        expected: "2.0.0",
        reported: null,
      }]);
    }
  });
}
