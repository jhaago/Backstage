import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  type User,
} from "firebase/auth";
import { auth, db } from "./firebase";
import { assertLiveRevision, assertNoteRevision } from "./guards";
import {
  cleanName,
  readyKey,
  insertOrder,
  sceneAfterDeletion,
  type Assignment,
  type Production,
  type RoleNote,
  type Scene,
  type Role,
} from "./domain";
import type { ImportData } from "./import";
export { signOut };
export const refs = {
  productions: () => collection(db, "productions"),
  production: (p: string) => doc(db, "productions", p),
  roles: (p: string) => collection(db, "productions", p, "roles"),
  scenes: (p: string) => collection(db, "productions", p, "scenes"),
  scene: (p: string, s: string) => doc(db, "productions", p, "scenes", s),
  performers: (p: string) => collection(db, "productions", p, "performers"),
  notes: (p: string) => collection(db, "productions", p, "roleNotes"),
  ready: (p: string) => collection(db, "productions", p, "ready"),
  note: (p: string, s: string, r: string) =>
    doc(db, "productions", p, "roleNotes", readyKey(s, r)),
  status: (p: string, s: string, r: string) =>
    doc(db, "productions", p, "ready", readyKey(s, r)),
  access: (p: string, uid: string) => doc(db, "productions", p, "access", uid),
};
export const withId = <T>(snapshot: DocumentSnapshot<DocumentData>): T =>
  ({ id: snapshot.id, ...snapshot.data() }) as T;
export function listenDoc<T>(
  reference: ReturnType<typeof doc>,
  onValue: (value: T | null, fromCache: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    reference,
    { includeMetadataChanges: true },
    (s) => onValue(s.exists() ? withId<T>(s) : null, s.metadata.fromCache),
    onError,
  );
}
export function listenList<T>(
  reference: ReturnType<typeof collection>,
  onValue: (value: T[], fromCache: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    reference,
    { includeMetadataChanges: true },
    (s: QuerySnapshot<DocumentData>) =>
      onValue(
        s.docs.map((d) => withId<T>(d)),
        s.metadata.fromCache,
      ),
    onError,
  );
}
export const login = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);
export async function isAdmin(user: User) {
  return (await getDoc(doc(db, "admins", user.uid))).exists();
}
export async function resolveInvite(token: string) {
  if (!/^[0-9a-f-]{60,}$/i.test(token))
    throw new Error("This production link is invalid.");
  if (!auth.currentUser) await signInAnonymously(auth);
  const snap = await getDoc(doc(db, "invites", token));
  if (!snap.exists())
    throw new Error("This production link has expired or was revoked.");
  const p = snap.data().productionId as string;
  const access = refs.access(p, auth.currentUser!.uid);
  const current = await getDoc(access);
  if (!current.exists() || current.data().invitationId !== token)
    await setDoc(access, { invitationId: token, roleId: "" });
  return p;
}
export async function joinRole(p: string, token: string, roleId: string) {
  if (!auth.currentUser) await signInAnonymously(auth);
  await setDoc(refs.access(p, auth.currentUser!.uid), {
    invitationId: token,
    roleId,
  });
  localStorage.setItem(`backstage-role-${p}`, roleId);
}
export async function createProduction(name: string, year = "") {
  const p = await addDoc(refs.productions(), {
    name: cleanName(name),
    year: year.trim(),
    archived: false,
    liveSceneId: null,
    liveRevision: 0,
  });
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  await setDoc(doc(db, "invites", token), { productionId: p.id });
  return { id: p.id, token };
}
export async function invitationFor(p: string) {
  const snapshot = await getDocs(collection(db, "invites"));
  return snapshot.docs.find((s) => s.data().productionId === p)?.id ?? null;
}
export async function rotateInvite(p: string) {
  const old = (await getDocs(collection(db, "invites"))).docs.filter(
    (d) => d.data().productionId === p,
  );
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  await setDoc(doc(db, "invites", token), { productionId: p });
  for (const item of old) await deleteDoc(item.ref);
  return token;
}
export async function addRole(p: string, name: string, order: number) {
  return addDoc(refs.roles(p), { name: cleanName(name), order });
}
export async function addScene(p: string, title: string, order: number) {
  const s = await addDoc(refs.scenes(p), { title: cleanName(title), order });
  const current = await getDoc(refs.production(p));
  if (!current.data()?.liveSceneId) {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(refs.production(p));
      if (!snap.data()?.liveSceneId)
        tx.update(refs.production(p), {
          liveSceneId: s.id,
          liveRevision: (snap.data()?.liveRevision ?? 0) + 1,
        });
    });
  }
  return s;
}
export async function addPerformer(p: string, name: string) {
  return addDoc(refs.performers(p), { name: cleanName(name) });
}
export async function updateNamed(
  p: string,
  kind: "roles" | "scenes" | "performers",
  id: string,
  name: string,
) {
  await updateDoc(doc(db, "productions", p, kind, id), {
    [kind === "scenes" ? "title" : "name"]: cleanName(name),
  });
}
export async function reorder(
  p: string,
  kind: "roles" | "scenes",
  items: { id: string; order: number }[],
  id: string,
  direction: -1 | 1,
) {
  const sorted = [...items].sort((a, b) => a.order - b.order),
    i = sorted.findIndex((x) => x.id === id),
    other = sorted[i + direction];
  if (i < 0 || !other) return;
  const batch = writeBatch(db);
  batch.update(doc(db, "productions", p, kind, id), { order: other.order });
  batch.update(doc(db, "productions", p, kind, other.id), {
    order: sorted[i].order,
  });
  await batch.commit();
}
export async function deleteScene(
  p: string,
  s: string,
  scenes: Scene[],
  production: Production,
) {
  const next = sceneAfterDeletion(scenes, s);
  await runTransaction(db, async (tx) => {
    const current = await tx.get(refs.production(p));
    if (!current.exists()) throw new Error("Production no longer exists.");
    assertLiveRevision(
      current.data() as Production,
      production.liveRevision,
      production.liveSceneId,
    );
    tx.delete(refs.scene(p, s));
    if (production.liveSceneId === s)
      tx.update(refs.production(p), {
        liveSceneId: next?.id ?? null,
        liveRevision: production.liveRevision + 1,
      });
  });
}
export async function duplicateScene(p: string, s: Scene, roles: Role[]) {
  const latest = (await getDocs(refs.scenes(p))).docs.map((d) =>
    withId<Scene>(d),
  );
  const copy = await addScene(
    p,
    `${s.title} (copy)`,
    insertOrder(latest, s.id),
  );
  for (const role of roles) {
    const old = await getDoc(refs.note(p, s.id, role.id));
    if (old.exists())
      await setDoc(refs.note(p, copy.id, role.id), {
        ...old.data(),
        sceneId: copy.id,
        revision: 1,
      });
  }
  return copy;
}
export async function advance(
  p: string,
  targetId: string,
  expectedRevision: number,
  expectedSceneId: string | null,
) {
  await runTransaction(db, async (tx) => {
    const ref = refs.production(p),
      snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Production no longer exists.");
    const current = snap.data() as Production;
    assertLiveRevision(current, expectedRevision, expectedSceneId);
    if (!(await tx.get(refs.scene(p, targetId))).exists())
      throw new Error("The selected scene no longer exists.");
    tx.update(ref, {
      liveSceneId: targetId,
      liveRevision: expectedRevision + 1,
    });
  });
}
export async function saveNote(
  p: string,
  s: string,
  r: string,
  notes: string,
  assignments: Assignment[],
  baseRevision: number,
) {
  await runTransaction(db, async (tx) => {
    const ref = refs.note(p, s, r),
      snap = await tx.get(ref),
      current = snap.data()?.revision ?? 0;
    assertNoteRevision(current, baseRevision);
    tx.set(ref, {
      sceneId: s,
      roleId: r,
      notes,
      assignments,
      revision: current + 1,
    } satisfies RoleNote);
  });
}
export async function setReady(
  p: string,
  s: string,
  r: string,
  expectedLiveId: string | null,
  desiredReady: boolean,
) {
  await runTransaction(db, async (tx) => {
    const production = await tx.get(refs.production(p));
    if (production.data()?.liveSceneId !== expectedLiveId)
      throw new Error("The live scene changed. Check the new upcoming scene.");
    const ref = refs.status(p, s, r);
    tx.set(ref, { sceneId: s, roleId: r, ready: desiredReady });
  });
}
export async function setActiveProduction(p: string | null) {
  await setDoc(doc(db, "config", "current"), { activeProductionId: p });
}
export async function archiveProduction(p: string, archived: boolean) {
  await updateDoc(refs.production(p), { archived });
  if (archived) {
    const active = await getDoc(doc(db, "config", "current"));
    if (active.data()?.activeProductionId === p)
      await setActiveProduction(null);
  }
}
export async function duplicateProduction(p: Production) {
  const [roles, scenes, performers, notes] = await Promise.all([
    getDocs(refs.roles(p.id)),
    getDocs(refs.scenes(p.id)),
    getDocs(refs.performers(p.id)),
    getDocs(refs.notes(p.id)),
  ]);
  const result = await createProduction(`${p.name} (copy)`, p.year);
  const roleMap = new Map<string, string>(),
    sceneMap = new Map<string, string>(),
    performerMap = new Map<string, string>();
  for (const item of roles.docs) {
    const n = await addRole(result.id, item.data().name, item.data().order);
    roleMap.set(item.id, n.id);
  }
  for (const item of scenes.docs) {
    const n = await addScene(result.id, item.data().title, item.data().order);
    sceneMap.set(item.id, n.id);
  }
  for (const item of performers.docs) {
    const n = await addPerformer(result.id, item.data().name);
    performerMap.set(item.id, n.id);
  }
  for (const item of notes.docs) {
    const v = item.data() as RoleNote,
      s = sceneMap.get(v.sceneId),
      r = roleMap.get(v.roleId);
    if (s && r)
      await setDoc(refs.note(result.id, s, r), {
        sceneId: s,
        roleId: r,
        notes: v.notes,
        assignments: v.assignments
          .filter((a) => performerMap.has(a.performerId))
          .map((a) => ({
            ...a,
            performerId: performerMap.get(a.performerId)!,
          })),
        revision: 1,
      });
  }
  return result;
}
export async function importProduction(data: ImportData) {
  const p = await createProduction(data.name, data.year ?? "");
  const roleMap = new Map<string, string>(),
    performerMap = new Map<string, string>();
  for (const [i, role] of data.roles.entries()) {
    const r = await addRole(p.id, role.name, i);
    roleMap.set(role.name, r.id);
  }
  const names = new Set([
    ...(data.performers ?? []).map((x) => x.name),
    ...data.scenes.flatMap((x) =>
      Object.values(x.roles ?? {}).flatMap((v) =>
        (v.performers ?? []).map((a) => a.name),
      ),
    ),
  ]);
  for (const name of names) {
    const perf = await addPerformer(p.id, name);
    performerMap.set(name, perf.id);
  }
  for (const [i, scene] of data.scenes.entries()) {
    const s = await addScene(p.id, scene.title, i);
    for (const [name, info] of Object.entries(scene.roles ?? {})) {
      const r = roleMap.get(name)!;
      await setDoc(refs.note(p.id, s.id, r), {
        sceneId: s.id,
        roleId: r,
        notes: info.notes ?? "",
        assignments: (info.performers ?? []).map((a) => ({
          performerId: performerMap.get(a.name)!,
          character: a.character,
        })),
        revision: 1,
      });
    }
  }
  return p;
}
export async function copyRoles(source: string, target: string) {
  const old = await getDocs(refs.roles(source));
  const existing = await getDocs(refs.roles(target));
  let order = Math.max(-1, ...existing.docs.map((r) => r.data().order)) + 1;
  for (const role of old.docs) {
    if (
      !existing.docs.some(
        (r) => r.data().name.toLowerCase() === role.data().name.toLowerCase(),
      )
    )
      await addRole(target, role.data().name, order++);
  }
}
