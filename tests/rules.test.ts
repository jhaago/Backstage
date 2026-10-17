import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { assertLiveRevision, assertNoteRevision } from "../src/guards";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  disableNetwork,
  enableNetwork,
} from "firebase/firestore";
const run = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
let env: RulesTestEnvironment;
run("Firestore access rules", () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-backstage-test",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "admins", "admin1"), { created: true });
      await setDoc(doc(db, "invites", "private-token"), {
        productionId: "show",
      });
      await setDoc(doc(db, "productions", "show"), {
        name: "Show",
        year: "2026",
        archived: false,
        liveSceneId: "opening",
        liveRevision: 1,
      });
      await setDoc(doc(db, "productions", "show", "roles", "props"), {
        name: "Props",
        order: 0,
      });
      await setDoc(doc(db, "productions", "show", "roles", "front"), {
        name: "Front Stage",
        order: 1,
      });
      await setDoc(doc(db, "productions", "show", "scenes", "opening"), {
        title: "Opening",
        order: 0,
      });
      await setDoc(
        doc(db, "productions", "show", "roleNotes", "opening_front"),
        {
          sceneId: "opening",
          roleId: "front",
          notes: "Enter left",
          assignments: [],
          revision: 1,
        },
      );
    });
  });
  it("allows link enrollment and shared same-role READY on independent sessions", async () => {
    const a = env.authenticatedContext("vol-a").firestore(),
      b = env.authenticatedContext("vol-b").firestore();
    for (const db of [a, b]) {
      await assertSucceeds(getDoc(doc(db, "invites", "private-token")));
      await assertSucceeds(
        setDoc(
          doc(
            db,
            "productions",
            "show",
            "access",
            db === a ? "vol-a" : "vol-b",
          ),
          { invitationId: "private-token", roleId: "" },
        ),
      );
      await assertSucceeds(
        updateDoc(
          doc(
            db,
            "productions",
            "show",
            "access",
            db === a ? "vol-a" : "vol-b",
          ),
          { roleId: "props" },
        ),
      );
    }
    await assertSucceeds(
      setDoc(doc(a, "productions", "show", "ready", "opening_props"), {
        sceneId: "opening",
        roleId: "props",
        ready: true,
      }),
    );
    await assertSucceeds(
      getDoc(doc(b, "productions", "show", "ready", "opening_props")),
    );
  });
  it("denies cross-role reads/writes and controller operations to volunteers", async () => {
    const db = env.authenticatedContext("vol-a").firestore();
    await setDoc(doc(db, "productions", "show", "access", "vol-a"), {
      invitationId: "private-token",
      roleId: "props",
    });
    await assertFails(
      getDoc(doc(db, "productions", "show", "roleNotes", "opening_front")),
    );
    await assertFails(
      setDoc(doc(db, "productions", "show", "roleNotes", "opening_front"), {
        sceneId: "opening",
        roleId: "front",
        notes: "tamper",
        assignments: [],
        revision: 2,
      }),
    );
    await assertFails(
      updateDoc(doc(db, "productions", "show"), {
        liveSceneId: "opening",
        liveRevision: 2,
      }),
    );
    await assertSucceeds(
      getDoc(doc(db, "productions", "show", "roleNotes", "opening_props")),
    );
    await assertSucceeds(
      getDoc(doc(db, "productions", "show", "ready", "opening_props")),
    );
    await assertSucceeds(
      setDoc(doc(db, "productions", "show", "roleNotes", "opening_props"), {
        sceneId: "opening",
        roleId: "props",
        notes: "Place table",
        assignments: [],
        revision: 1,
      }),
    );
  });
  it("allows administrator and revokes members when the invitation is deleted", async () => {
    const admin = env.authenticatedContext("admin1").firestore(),
      member = env.authenticatedContext("vol-a").firestore();
    await assertSucceeds(
      updateDoc(doc(admin, "productions", "show"), { liveRevision: 2 }),
    );
    await setDoc(doc(member, "productions", "show", "access", "vol-a"), {
      invitationId: "private-token",
      roleId: "props",
    });
    await assertSucceeds(getDoc(doc(member, "productions", "show")));
    await deleteDoc(doc(admin, "invites", "private-token"));
    await assertFails(getDoc(doc(member, "productions", "show")));
  });

  it("synchronises notes, readiness and recovered live state across client sessions", async () => {
    const a = env.authenticatedContext("vol-a").firestore(),
      b = env.authenticatedContext("vol-b").firestore(),
      admin = env.authenticatedContext("admin1").firestore();
    for (const [db, uid] of [
      [a, "vol-a"],
      [b, "vol-b"],
    ] as const)
      await setDoc(doc(db, "productions", "show", "access", uid), {
        invitationId: "private-token",
        roleId: "props",
      });
    const watched = doc(b, "productions", "show", "roleNotes", "opening_props");
    const noteSeen = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        reject(new Error("note did not synchronise"));
      }, 6000);
      const unsub = onSnapshot(
        watched,
        (s) => {
          if (s.data()?.notes === "Place table") {
            clearTimeout(timeout);
            unsub();
            resolve();
          }
        },
        reject,
      );
    });
    await setDoc(doc(a, "productions", "show", "roleNotes", "opening_props"), {
      sceneId: "opening",
      roleId: "props",
      notes: "Place table",
      assignments: [],
      revision: 1,
    });
    await noteSeen;
    const status = doc(b, "productions", "show", "ready", "opening_props");
    const readySeen = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        reject(new Error("READY did not synchronise"));
      }, 6000);
      const unsub = onSnapshot(
        status,
        (s) => {
          if (s.data()?.ready === true) {
            clearTimeout(timeout);
            unsub();
            resolve();
          }
        },
        reject,
      );
    });
    await setDoc(doc(a, "productions", "show", "ready", "opening_props"), {
      sceneId: "opening",
      roleId: "props",
      ready: true,
    });
    await readySeen;
    await assertSucceeds(
      getDoc(doc(admin, "productions", "show", "ready", "opening_props")),
    );
    await disableNetwork(b);
    await setDoc(doc(admin, "productions", "show", "scenes", "arrival"), {
      title: "Arrival",
      order: 1,
    });
    await updateDoc(doc(admin, "productions", "show"), {
      liveSceneId: "arrival",
      liveRevision: 2,
    });
    await enableNetwork(b);
    const current = await getDoc(doc(b, "productions", "show"));
    if (current.data()?.liveSceneId !== "arrival")
      throw new Error("Client did not recover the latest live scene");
  }, 15000);
  it("prevents two controller transactions using the same revision from both advancing", async () => {
    const one = env.authenticatedContext("admin1").firestore(),
      two = env.authenticatedContext("admin2").firestore();
    await env.withSecurityRulesDisabled(async (context) =>
      setDoc(doc(context.firestore(), "admins", "admin2"), { created: true }),
    );
    await setDoc(doc(one, "productions", "show", "scenes", "arrival"), {
      title: "Arrival",
      order: 1,
    });
    const move = async (db: typeof one) =>
      runTransaction(db, async (tx) => {
        const ref = doc(db, "productions", "show"),
          snap = await tx.get(ref);
        assertLiveRevision(
          snap.data() as { liveRevision: number; liveSceneId: string | null },
          1,
          "opening",
        );
        tx.update(ref, { liveSceneId: "arrival", liveRevision: 2 });
      });
    const results = await Promise.allSettled([move(one), move(two)]);
    if (results.filter((x) => x.status === "fulfilled").length !== 1)
      throw new Error("Expected exactly one successful advance");
  });

  it("permits an administrator to create production structure", async () => {
    const admin = env.authenticatedContext("admin1").firestore();
    await assertSucceeds(
      setDoc(doc(admin, "productions", "new-show"), {
        name: "New show",
        year: "2027",
        archived: false,
        liveSceneId: null,
        liveRevision: 0,
      }),
    );
    await assertSucceeds(
      setDoc(doc(admin, "productions", "new-show", "roles", "costumes"), {
        name: "Costumes",
        order: 0,
      }),
    );
    await assertSucceeds(
      setDoc(doc(admin, "productions", "new-show", "scenes", "one"), {
        title: "Opening",
        order: 0,
      }),
    );
    await assertSucceeds(
      setDoc(doc(admin, "invites", "another-private-token"), {
        productionId: "new-show",
      }),
    );
  });
  it("rejects the second concurrent note save and preserves the first", async () => {
    const a = env.authenticatedContext("vol-a").firestore(),
      b = env.authenticatedContext("vol-b").firestore();
    for (const [db, uid] of [
      [a, "vol-a"],
      [b, "vol-b"],
    ] as const)
      await setDoc(doc(db, "productions", "show", "access", uid), {
        invitationId: "private-token",
        roleId: "front",
      });
    const save = async (db: typeof a, notes: string) =>
      runTransaction(db, async (tx) => {
        const ref = doc(
            db,
            "productions",
            "show",
            "roleNotes",
            "opening_front",
          ),
          snap = await tx.get(ref);
        assertNoteRevision(snap.data()?.revision ?? 0, 1);
        tx.set(ref, {
          sceneId: "opening",
          roleId: "front",
          notes,
          assignments: [],
          revision: 2,
        });
      });
    const results = await Promise.allSettled([
      save(a, "Enter right"),
      save(b, "Enter center"),
    ]);
    if (results.filter((x) => x.status === "fulfilled").length !== 1)
      throw new Error(
        "Expected one saved note and one preserved conflicting draft",
      );
    const final = await getDoc(
      doc(a, "productions", "show", "roleNotes", "opening_front"),
    );
    if (final.data()?.revision !== 2)
      throw new Error("Unexpected note revision");
  });
  it("denies access without a private link", async () => {
    const outsider = env.authenticatedContext("stranger").firestore();
    await assertFails(getDoc(doc(outsider, "productions", "show")));
    await assertFails(
      setDoc(doc(outsider, "productions", "show", "access", "stranger"), {
        invitationId: "invented",
        roleId: "props",
      }),
    );
  });
});
