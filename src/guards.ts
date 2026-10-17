import { conflictMessage } from "./domain";
export function assertLiveRevision(
  current: { liveRevision: number; liveSceneId: string | null },
  expectedRevision: number,
  expectedSceneId: string | null,
) {
  if (
    current.liveRevision !== expectedRevision ||
    current.liveSceneId !== expectedSceneId
  )
    throw new Error(
      "The live scene changed on another controller. The show was not advanced again.",
    );
}
export function assertNoteRevision(current: number, expected: number) {
  if (current !== expected) throw new Error(conflictMessage(expected, current));
}
