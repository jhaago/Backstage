import { describe, it, expect } from "vitest";
import {
  nextScene,
  scenePosition,
  readyKey,
  shouldFollowLive,
  applyLiveChange,
  conflictMessage,
} from "../src/domain";
import { parseImport } from "../src/import";
const scenes = [
  { id: "a", title: "Opening", order: 0 },
  { id: "b", title: "Arrival", order: 1 },
  { id: "c", title: "Finale", order: 2 },
];
describe("show position", () => {
  it("finds the next scene and stops at the end", () => {
    expect(nextScene(scenes, "a")?.id).toBe("b");
    expect(nextScene(scenes, "c")).toBeNull();
  });
  it("classifies viewed scenes relative to live", () => {
    expect(scenePosition(scenes, "a", "b")).toBe("previous");
    expect(scenePosition(scenes, "b", "b")).toBe("live");
    expect(scenePosition(scenes, "c", "b")).toBe("next");
  });
  it("targets readiness to upcoming live scene independent of viewed scene", () => {
    expect(readyKey("b", "props")).toBe("b_props");
  });
  it("navigates on a new revision but defers during an edit", () => {
    expect(shouldFollowLive(3, 4, false)).toBe(true);
    expect(shouldFollowLive(3, 4, true)).toBe(false);
    expect(applyLiveChange("c", "b", true)).toEqual({
      viewId: "c",
      pendingId: "b",
    });
  });
  it("keeps the local draft on an edit conflict", () => {
    expect(conflictMessage(1, 2)).toMatch(/another device/i);
  });
});
describe("import", () => {
  it("accepts a simple external running order", () => {
    expect(
      parseImport(
        JSON.stringify({
          name: "Christmas 2027",
          roles: [{ name: "Props" }],
          scenes: [
            {
              title: "Opening",
              roles: {
                Props: {
                  notes: "Place table",
                  performers: [{ name: "Alex", character: "Narrator" }],
                },
              },
            },
          ],
        }),
      ).scenes,
    ).toHaveLength(1);
  });
  it("rejects missing roles and scene titles", () => {
    expect(() =>
      parseImport('{"name":"X","roles":[],"scenes":[{"title":""}]}'),
    ).toThrow();
  });
});
import { insertOrder, sceneAfterDeletion } from "../src/domain";
describe("scene changes", () => {
  it("gives repeated duplicates distinct positions beside their source", () => {
    const first = insertOrder(scenes, "a");
    const second = insertOrder(
      [...scenes, { id: "copy", title: "Copy", order: first }],
      "a",
    );
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
  });
  it("moves a deleted live scene to its nearest next scene", () => {
    expect(sceneAfterDeletion(scenes, "b")?.id).toBe("c");
    expect(sceneAfterDeletion(scenes, "c")?.id).toBe("b");
  });
});
import { hasDraftChanges } from "../src/domain";
it("detects unsaved text and cast edits before closing", () => {
  const original = {
    notes: "Wait",
    assignments: [{ performerId: "p", character: "Mary" }],
  };
  expect(
    hasDraftChanges(original, "Wait", [
      { performerId: "p", character: "Mary" },
    ]),
  ).toBe(false);
  expect(
    hasDraftChanges(original, "Move left", [
      { performerId: "p", character: "Mary" },
    ]),
  ).toBe(true);
  expect(
    hasDraftChanges(original, "Wait", [
      { performerId: "p", character: "Joseph" },
    ]),
  ).toBe(true);
});
import { readyIntent } from "../src/domain";
it("uses an explicit READY intent so two confirmations cannot cancel each other", () => {
  expect(readyIntent(false)).toBe(true);
  expect(readyIntent(true)).toBe(false);
});
it("rejects likely duplicate performer names in an import", () => {
  expect(() =>
    parseImport(
      JSON.stringify({
        name: "X",
        roles: [{ name: "Front" }],
        performers: [{ name: "Sophie" }, { name: "sophie" }],
        scenes: [{ title: "Opening" }],
      }),
    ),
  ).toThrow(/duplicate performer/i);
});
