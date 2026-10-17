export type ImportAssignment = { name: string; character: string };
export type ImportRoleInfo = {
  notes?: string;
  performers?: ImportAssignment[];
};
export type ImportScene = {
  title: string;
  roles?: Record<string, ImportRoleInfo>;
};
export type ImportData = {
  name: string;
  year?: string;
  roles: { name: string }[];
  performers?: { name: string }[];
  scenes: ImportScene[];
};
export function parseImport(raw: string): ImportData {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  if (!data || typeof data !== "object")
    throw new Error("Expected a production object.");
  const d = data as Partial<ImportData>;
  if (typeof d.name !== "string" || !d.name.trim())
    throw new Error("Production name is required.");
  if (
    !Array.isArray(d.roles) ||
    !d.roles.length ||
    d.roles.some((r) => typeof r?.name !== "string" || !r.name.trim())
  )
    throw new Error("At least one named role is required.");
  if (
    new Set(d.roles.map((r) => r.name.trim().toLowerCase())).size !==
    d.roles.length
  )
    throw new Error("Role names must be unique.");
  if (
    !Array.isArray(d.scenes) ||
    !d.scenes.length ||
    d.scenes.some((s) => typeof s?.title !== "string" || !s.title.trim())
  )
    throw new Error("At least one titled scene is required.");
  const roles = new Set(d.roles.map((r) => r.name));
  for (const scene of d.scenes) {
    for (const [role, info] of Object.entries(scene.roles ?? {})) {
      if (!roles.has(role)) throw new Error(`Unknown role in scene: ${role}`);
      if (
        !info ||
        typeof info !== "object" ||
        (info.notes !== undefined && typeof info.notes !== "string") ||
        !Array.isArray(info.performers ?? [])
      )
        throw new Error(`Invalid details for ${role}`);
      for (const a of info.performers ?? [])
        if (
          typeof a.name !== "string" ||
          !a.name.trim() ||
          typeof a.character !== "string"
        )
          throw new Error(`Invalid performer assignment for ${role}`);
    }
  }
  if (
    d.performers !== undefined &&
    (!Array.isArray(d.performers) ||
      d.performers.some((p) => typeof p?.name !== "string" || !p.name.trim()))
  )
    throw new Error("Invalid performer directory.");
  const names = [
    ...(d.performers ?? []).map((p) => p.name),
    ...d.scenes.flatMap((scene) =>
      Object.values(scene.roles ?? {}).flatMap((info) =>
        (info.performers ?? []).map((p) => p.name),
      ),
    ),
  ];
  const spelling = new Map<string, string>();
  for (const name of names) {
    const key = name.trim().toLocaleLowerCase(),
      existing = spelling.get(key);
    if (existing && existing !== name.trim())
      throw new Error(
        `Likely duplicate performer: ${existing} / ${name.trim()}`,
      );
    spelling.set(key, name.trim());
  }
  return d as ImportData;
}
