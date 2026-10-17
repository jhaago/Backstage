import { expect, it } from "vitest";
import { assertLiveRevision, assertNoteRevision } from "../src/guards";
it("rejects a stale controller advance instead of skipping", () => {
  expect(() =>
    assertLiveRevision({ liveRevision: 4, liveSceneId: "b" }, 3, "a"),
  ).toThrow(/changed/i);
});
it("rejects a stale note save without changing its draft", () => {
  expect(() => assertNoteRevision(2, 3)).toThrow(/another device/i);
});
