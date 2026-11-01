// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

const backend = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  lists: new Map<string, unknown[]>(),
  listeners: new Map<string, Set<(value: any, cache: boolean) => void>>(),
}));
vi.mock("../src/firebase", () => ({ auth: {} }));
vi.mock("../src/store", () => {
  const reference = (...parts: string[]) => ({ path: parts.join("/") });
  function listen(
    ref: { path: string },
    cb: (v: any, c: boolean) => void,
    list: boolean,
  ) {
    const listeners = backend.listeners.get(ref.path) ?? new Set();
    listeners.add(cb);
    backend.listeners.set(ref.path, listeners);
    cb(
      (list ? backend.lists : backend.docs).get(ref.path) ?? (list ? [] : null),
      false,
    );
    return () => {
      listeners.delete(cb);
    };
  }
  return {
    refs: {
      production: (p: string) => reference(p),
      roles: (p: string) => reference(p, "roles"),
      scenes: (p: string) => reference(p, "scenes"),
      performers: (p: string) => reference(p, "performers"),
      note: (p: string, s: string, r: string) => reference(p, "notes", s, r),
      status: (p: string, s: string, r: string) => reference(p, "ready", s, r),
    },
    listenDoc: (r: { path: string }, cb: (v: any, c: boolean) => void) =>
      listen(r, cb, false),
    listenList: (r: { path: string }, cb: (v: any, c: boolean) => void) =>
      listen(r, cb, true),
    joinRole: vi.fn(),
    setReady: vi.fn(),
    saveNote: vi.fn(),
    addPerformer: vi.fn(),
    updateNamed: vi.fn(),
  };
});
import { Volunteer } from "../src/Volunteer";
import { saveNote, joinRole } from "../src/store";

const scenes = [
  { id: "a", title: "Opening", order: 0 },
  { id: "b", title: "Arrival", order: 1 },
  { id: "c", title: "Finale", order: 2 },
];
const production = {
  id: "show",
  name: "BETHLEHEM",
  year: "2026",
  archived: false,
  liveSceneId: "a",
  liveRevision: 1,
};
function emit(path: string, value: unknown, cache = false) {
  if (Array.isArray(value)) backend.lists.set(path, value);
  else backend.docs.set(path, value);
  act(() => backend.listeners.get(path)?.forEach((cb) => cb(value, cache)));
}
function mount() {
  return render(
    <Volunteer productionId="show" token="test" onExit={() => {}} />,
  );
}

beforeEach(() => {
  backend.docs.clear();
  backend.lists.clear();
  backend.listeners.clear();
  localStorage.clear();
  localStorage.setItem("backstage-role-show", "front");
  backend.docs.set("show", production);
  backend.lists.set("show/roles", [
    { id: "front", name: "Front Stage", order: 0 },
  ]);
  backend.lists.set("show/scenes", scenes);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("volunteer follows the show controller", () => {
  it("brings independently browsing phones back on every controller change", () => {
    const first = mount(),
      second = mount();
    fireEvent.click(
      first.container.querySelector(".bottom-nav button:last-child")!,
    );
    fireEvent.click(
      second.container.querySelector(".bottom-nav button:last-child")!,
    );
    fireEvent.click(
      second.container.querySelector(".bottom-nav button:last-child")!,
    );
    emit("show", { ...production, liveSceneId: "b", liveRevision: 2 });
    expect(first.container.querySelector(".scene-card h2")?.textContent).toBe(
      "Arrival",
    );
    expect(second.container.querySelector(".scene-card h2")?.textContent).toBe(
      "Arrival",
    );
  });

  it("follows live when the scene list arrives after an initially empty cached list", () => {
    backend.lists.set("show/scenes", []);
    const screen = mount();
    emit("show/scenes", scenes);
    expect(screen.container.querySelector(".scene-card h2")?.textContent).toBe(
      "Opening",
    );
  });

  it("returns a browsing phone to live when it reconnects while visible", () => {
    const screen = mount();
    fireEvent.click(
      screen.container.querySelector(".bottom-nav button:last-child")!,
    );
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(screen.container.querySelector(".scene-card h2")?.textContent).toBe(
      "Opening",
    );
  });

  it.each(["focus", "pageshow"])(
    "returns to live when a suspended phone resumes with %s",
    (event) => {
      const screen = mount();
      fireEvent.click(
        screen.container.querySelector(".bottom-nav button:last-child")!,
      );
      act(() => window.dispatchEvent(new Event(event)));
      expect(
        screen.container.querySelector(".scene-card h2")?.textContent,
      ).toBe("Opening");
    },
  );

  it("preserves an open draft through several scene changes and then follows the latest live scene", () => {
    const screen = mount();
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("Instructions / notes"), {
      target: { value: "Keep this draft" },
    });
    emit("show", { ...production, liveSceneId: "b", liveRevision: 2 });
    emit("show", { ...production, liveSceneId: "c", liveRevision: 3 });
    expect(
      (screen.getByLabelText("Instructions / notes") as HTMLTextAreaElement)
        .value,
    ).toBe("Keep this draft");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByText("Discard changes"));
    expect(screen.container.querySelector(".scene-card h2")?.textContent).toBe(
      "Finale",
    );
  });

  it("follows the latest live scene when the controller advances during a save", async () => {
    let finish!: () => void;
    vi.mocked(saveNote).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const screen = mount();
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("Instructions / notes"), {
      target: { value: "Saved draft" },
    });
    fireEvent.click(screen.getByText("Save changes"));
    emit("show", { ...production, liveSceneId: "b", liveRevision: 2 });
    emit("show", { ...production, liveSceneId: "c", liveRevision: 3 });
    await act(async () => finish());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.container.querySelector(".scene-card h2")?.textContent).toBe(
      "Finale",
    );
  });

  it("follows the latest live scene when the controller advances during role enrollment", async () => {
    localStorage.clear();
    let finish!: () => void;
    vi.mocked(joinRole).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const screen = mount();
    fireEvent.click(screen.getByText("Front Stage"));
    emit("show", { ...production, liveSceneId: "c", liveRevision: 3 });
    await act(async () => finish());
    expect(screen.container.querySelector(".scene-card h2")?.textContent).toBe(
      "Finale",
    );
  });

  it("returns to live after a cached production snapshot is replaced by server data", () => {
    const screen = mount();
    fireEvent.click(
      screen.container.querySelector(".bottom-nav button:last-child")!,
    );
    emit("show", production, true);
    emit("show", production, false);
    expect(screen.container.querySelector(".scene-card h2")?.textContent).toBe(
      "Opening",
    );
  });

  it("still reports Connected at the end of the running order", () => {
    backend.docs.set("show", {
      ...production,
      liveSceneId: "c",
      liveRevision: 2,
    });
    const screen = mount();
    expect(
      screen.container.querySelector(".connection")?.textContent?.trim(),
    ).toBe("Connected");
  });

  it("does not reuse READY when the controller returns to a previously visited scene", () => {
    backend.docs.set("show/ready/b/front", {
      sceneId: "b",
      roleId: "front",
      ready: true,
      liveRevision: 1,
    });
    const screen = mount();
    expect(
      screen.container
        .querySelector(".ready-control")
        ?.classList.contains("is-ready"),
    ).toBe(true);
    emit("show", { ...production, liveSceneId: "b", liveRevision: 2 });
    emit("show", { ...production, liveRevision: 3 });
    expect(
      screen.container
        .querySelector(".ready-control")
        ?.classList.contains("is-ready"),
    ).toBe(false);
    emit("show/ready/b/front", {
      sceneId: "b",
      roleId: "front",
      ready: true,
      liveRevision: 3,
    });
    expect(
      screen.container
        .querySelector(".ready-control")
        ?.classList.contains("is-ready"),
    ).toBe(true);
  });

  it("does not show a cached READY as a confirmed green light", () => {
    const screen = mount();
    emit(
      "show/ready/b/front",
      { sceneId: "b", roleId: "front", ready: true, liveRevision: 1 },
      true,
    );
    expect(
      screen.container
        .querySelector(".ready-control")
        ?.classList.contains("is-ready"),
    ).toBe(false);
    expect(
      (screen.container.querySelector(".ready-control") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
