import { describe, expect, it } from "vitest";
import { controllerReadiness } from "../src/domain";

const roles = [
  { id: "stage", name: "Stagehands", order: 0 },
  { id: "choir", name: "Choir", order: 1 },
];

describe("controller readiness indicator", () => {
  it("only lights for the selected role and upcoming scene", () => {
    const statuses = [
      { roleId: "stage", sceneId: "opening", ready: true, liveRevision: 1 },
      { roleId: "choir", sceneId: "arrival", ready: true, liveRevision: 1 },
    ];
    expect(
      controllerReadiness("stage", roles, "arrival", statuses, true, 1),
    ).toBe("not-ready");
    expect(
      controllerReadiness(
        "stage",
        roles,
        "arrival",
        [
          ...statuses,
          { roleId: "stage", sceneId: "arrival", ready: true, liveRevision: 1 },
        ],
        true,
        1,
      ),
    ).toBe("ready");
  });

  it("reflects cancellation and does not carry readiness into a new scene", () => {
    expect(
      controllerReadiness(
        "stage",
        roles,
        "arrival",
        [
          {
            roleId: "stage",
            sceneId: "arrival",
            ready: false,
            liveRevision: 1,
          },
        ],
        true,
        1,
      ),
    ).toBe("not-ready");
    expect(
      controllerReadiness(
        "stage",
        roles,
        "finale",
        [{ roleId: "stage", sceneId: "arrival", ready: true, liveRevision: 1 }],
        true,
        1,
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
        [{ roleId: "stage", sceneId: "arrival", ready: true, liveRevision: 1 }],
        true,
        1,
      ),
    ).toBe("ready");
  });

  it("requires choosing a role if none is configured or the configured role is removed", () => {
    expect(controllerReadiness(undefined, roles, "arrival", [], true, 1)).toBe(
      "no-role",
    );
    expect(controllerReadiness("removed", roles, "arrival", [], true, 1)).toBe(
      "no-role",
    );
  });

  it("does not show stale READY data as a healthy green signal", () => {
    expect(
      controllerReadiness(
        "stage",
        roles,
        "arrival",
        [{ roleId: "stage", sceneId: "arrival", ready: true, liveRevision: 1 }],
        false,
        1,
      ),
    ).toBe("unavailable");
  });

  it("shows the end of the running order when there is no upcoming scene", () => {
    expect(
      controllerReadiness(
        "stage",
        roles,
        null,
        [{ roleId: "stage", sceneId: "arrival", ready: true, liveRevision: 1 }],
        true,
        1,
      ),
    ).toBe("show-end");
  });
});

it("resets the controller light on each live revision even when returning to the same scene", () => {
  const statuses = [
    { roleId: "stage", sceneId: "arrival", ready: true, liveRevision: 1 },
  ];
  expect(
    controllerReadiness("stage", roles, "arrival", statuses, true, 3),
  ).toBe("not-ready");
  expect(
    controllerReadiness(
      "stage",
      roles,
      "arrival",
      [{ ...statuses[0], liveRevision: 3 }],
      true,
      3,
    ),
  ).toBe("ready");
});

it("ignores legacy READY records without a live revision", () => {
  expect(
    controllerReadiness(
      "stage",
      roles,
      "arrival",
      [{ roleId: "stage", sceneId: "arrival", ready: true }],
      true,
      1,
    ),
  ).toBe("not-ready");
});
