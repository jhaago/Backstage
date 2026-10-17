export type Scene = { id: string; title: string; order: number };
export type Role = { id: string; name: string; order: number };
export type Performer = { id: string; name: string };
export type Assignment = { performerId: string; character: string };
export type RoleNote = {
  sceneId: string;
  roleId: string;
  notes: string;
  assignments: Assignment[];
  revision: number;
};
export type Production = {
  id: string;
  name: string;
  year: string;
  archived: boolean;
  liveSceneId: string | null;
  liveRevision: number;
};
export const ordered = <T extends { order: number }>(items: T[]) =>
  [...items].sort((a, b) => a.order - b.order);
export const readyKey = (sceneId: string, roleId: string) =>
  `${sceneId}_${roleId}`;
export function nextScene(
  scenes: Scene[],
  liveId: string | null,
): Scene | null {
  const list = ordered(scenes);
  if (!liveId) return list[0] ?? null;
  return list[list.findIndex((s) => s.id === liveId) + 1] ?? null;
}
export function scenePosition(
  scenes: Scene[],
  viewId: string,
  liveId: string | null,
): "live" | "next" | "future" | "previous" {
  const list = ordered(scenes);
  const i = list.findIndex((s) => s.id === viewId),
    live = list.findIndex((s) => s.id === liveId);
  if (i === live) return "live";
  if (i < live) return "previous";
  return i === live + 1 ? "next" : "future";
}
export const shouldFollowLive = (
  previousRevision: number,
  newRevision: number,
  editing: boolean,
) => newRevision !== previousRevision && !editing;
export const applyLiveChange = (
  viewId: string,
  newLiveId: string,
  editing: boolean,
) =>
  editing
    ? { viewId, pendingId: newLiveId }
    : { viewId: newLiveId, pendingId: null };
export const conflictMessage = (base: number, current: number) =>
  `Another device saved changes while you were editing (version ${base} → ${current}). Your draft is preserved. Review the latest version before saving again.`;
export const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");
export const duplicateNames = (name: string, performers: Performer[]) =>
  performers.filter(
    (p) =>
      cleanName(p.name).toLocaleLowerCase() ===
      cleanName(name).toLocaleLowerCase(),
  );
export function insertOrder(scenes: Scene[], sourceId: string) {
  const list = ordered(scenes),
    i = list.findIndex((s) => s.id === sourceId);
  if (i < 0) throw new Error("Scene no longer exists.");
  return list[i + 1]
    ? (list[i].order + list[i + 1].order) / 2
    : list[i].order + 1;
}
export function sceneAfterDeletion(scenes: Scene[], deletedId: string) {
  const list = ordered(scenes),
    i = list.findIndex((s) => s.id === deletedId);
  return list[i + 1] ?? list[i - 1] ?? null;
}
export function hasDraftChanges(
  original: { notes: string; assignments: Assignment[] },
  notes: string,
  assignments: Assignment[],
) {
  return (
    original.notes !== notes ||
    JSON.stringify(original.assignments) !== JSON.stringify(assignments)
  );
}
export const readyIntent = (currentlyReady: boolean) => !currentlyReady;
