import { describe, expect, it } from "vitest";
import { controllerReadiness } from "../src/domain";

const roles = [
  { id: "stage", name: "Stagehands", order: 0 },
  { id: "choir", name: "Choir", order: 1 },
];

describe("controller readiness indicator", () => {
  it("only lights for the selected role and upcoming scene", () => {
    const statuses = [
      { roleId: "stage", sceneId: "opening", ready: true },
      { roleId: "choir", sceneId: "arrival", ready: true },
    ];
    expect(controllerReadiness("stage", roles, "arrival", statuses, true)).toBe(
      "not-ready",
    );
    expect(
      controllerReadiness(
        "stage",
        roles,
        "arrival",
        [...statuses, { roleId: "stage", sceneId: "arrival", ready: true }],
        true,
      ),
    ).toBe("ready");
  });

  it("reflects cancellation and does not carry readiness into a new scene", () => {
    expect(
      controllerReadiness(
        "stage",
        roles,
        "arrival",
        [{ roleId: "stage", sceneId: "arrival", ready: false }],
        true,
      ),
    ).toBe("not-ready");
    expect(
      controllerReadiness(
        "stage",
        roles,
        "finale",
        [{ roleId: "stage", sceneId: "arrival", ready: true }],
        true,
      ),
    ).toBe("not-ready");
  });

  it("keeps the chosen role when names or order change", () => {
    const renamed = [roles[1], { ...roles[0], name: "Front Stage", order: 2 }];
    expect(
      controllerReadiness(
        "stage",
        renamed,
        "arrival",
        [{ roleId: "stage", sceneId: "arrival", ready: true }],
        true,
      ),
    ).toBe("ready");
  });

  it("requires choosing a role if none is configured or the configured role is removed", () => {
    expect(controllerReadiness(undefined, roles, "arrival", [], true)).toBe(
      "no-role",
    );
    expect(controllerReadiness("removed", roles, "arrival", [], true)).toBe(
      "no-role",
    );
  });

  it("does not show stale READY data as a healthy green signal", () => {
    expect(
      controllerReadiness(
        "stage",
        roles,
        "arrival",
        [{ roleId: "stage", sceneId: "arrival", ready: true }],
        false,
      ),
    ).toBe("unavailable");
  });

  it("shows the end of the running order when there is no upcoming scene", () => {
    expect(
      controllerReadiness(
        "stage",
        roles,
        null,
        [{ roleId: "stage", sceneId: "arrival", ready: true }],
        true,
      ),
    ).toBe("show-end");
  });
});
