import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  duplicateNames,
  hasDraftChanges,
  type Assignment,
  type Performer,
  type RoleNote,
} from "./domain";
import { addPerformer, saveNote, updateNamed } from "./store";
export function SceneEditor({
  productionId,
  sceneId,
  roleId,
  performers,
  note,
  onClose,
  onSaved,
}: {
  productionId: string;
  sceneId: string;
  roleId: string;
  performers: Performer[];
  note: RoleNote | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(note?.notes ?? ""),
    [assignments, setAssignments] = useState<Assignment[]>(
      note?.assignments ?? [],
    ),
    [revision, setRevision] = useState(note?.revision ?? 0),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [newer, setNewer] = useState(false),
    [directory, setDirectory] = useState(false);
  useEffect(() => {
    if ((note?.revision ?? 0) > revision) setNewer(true);
  }, [note?.revision, revision]);
  const dirty = hasDraftChanges(
    { notes: note?.notes ?? "", assignments: note?.assignments ?? [] },
    notes,
    assignments,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function discard() {
    if (dirty && !confirm("Discard unsaved scene changes?")) return;
    onClose();
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await saveNote(
        productionId,
        sceneId,
        roleId,
        notes,
        assignments,
        revision,
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function renamePerson(person: Performer) {
    const candidate = prompt("Performer name", person.name)?.trim();
    if (!candidate || candidate === person.name) return;
    if (
      duplicateNames(
        candidate,
        performers.filter((p) => p.id !== person.id),
      ).length
    ) {
      setError("A performer with that name already exists.");
      return;
    }
    try {
      await updateNamed(productionId, "performers", person.id, candidate);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addName() {
    const clean = name.trim();
    if (!clean) return;
    const matches = duplicateNames(clean, performers);
    if (
      matches.length &&
      !confirm(`${matches[0].name} already exists. Use that performer?`)
    )
      return;
    try {
      const id = matches.length
        ? matches[0].id
        : (await addPerformer(productionId, clean)).id;
      setAssignments((a) => [...a, { performerId: id, character: "" }]);
      setName("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="editor panel"
        role="dialog"
        aria-modal="true"
        aria-label="Edit scene information"
      >
        <header className="editor-head">
          <div>
            <span className="eyebrow">SCENE DETAILS</span>
            <h2>Edit your information</h2>
          </div>
          <button
            className="icon-btn"
            onClick={discard}
            aria-label="Close editor"
          >
            <X />
          </button>
        </header>
        {newer && (
          <div className="alert">
            Another device updated this scene. Your draft is still here. Review
            the latest information before continuing.{" "}
            <button
              onClick={() => {
                setNotes(note?.notes ?? "");
                setAssignments(note?.assignments ?? []);
                setRevision(note?.revision ?? 0);
                setNewer(false);
                setError("");
              }}
            >
              Load latest
            </button>
          </div>
        )}
        <label className="field-label">Performers & characters</label>
        <div className="assignment-list">
          {assignments.map((a, i) => (
            <div className="assignment-row" key={i}>
              <select
                aria-label={`Performer ${i + 1}`}
                value={a.performerId}
                onChange={(e) =>
                  setAssignments((rows) =>
                    rows.map((row, j) =>
                      j === i ? { ...row, performerId: e.target.value } : row,
                    ),
                  )
                }
              >
                {performers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Character or group ${i + 1}`}
                placeholder="Character / group"
                value={a.character}
                onChange={(e) =>
                  setAssignments((rows) =>
                    rows.map((row, j) =>
                      j === i ? { ...row, character: e.target.value } : row,
                    ),
                  )
                }
              />
              <button
                className="icon-btn"
                aria-label="Remove assignment"
                onClick={() =>
                  setAssignments((rows) => rows.filter((_, j) => j !== i))
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
        <div className="inline-form">
          <select
            aria-label="Select performer to assign"
            defaultValue=""
            id="add-existing"
            onChange={(e) => {
              if (e.target.value) {
                setAssignments((a) => [
                  ...a,
                  { performerId: e.target.value, character: "" },
                ]);
                e.target.value = "";
              }
            }}
          >
            <option value="">Add existing performer…</option>
            {performers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="inline-form">
          <input
            aria-label="New performer name"
            placeholder="New performer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addName();
              }
            }}
          />
          <button className="button secondary" onClick={addName}>
            <Plus size={16} /> Add
          </button>
        </div>
        <button
          className="text-button directory-toggle"
          onClick={() => setDirectory(!directory)}
        >
          {directory ? "Hide" : "Manage"} shared performer directory
        </button>
        {directory && (
          <div className="directory-list">
            {performers.map((p) => (
              <div className="manage-row" key={p.id}>
                <strong>{p.name}</strong>
                <button className="text-button" onClick={() => renamePerson(p)}>
                  Rename
                </button>
              </div>
            ))}
            {!performers.length && <p className="empty">No performers yet.</p>}
          </div>
        )}
        <label className="field-label" htmlFor="scene-notes">
          Instructions / notes
        </label>
        <textarea
          id="scene-notes"
          rows={9}
          placeholder="What does your team need to know for this scene?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="editor-actions">
          <button className="button ghost" onClick={discard}>
            Discard changes
          </button>
          <button className="button primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </footer>
        <p className="fineprint">
          Saved only after the server confirms. If two people edit at once, the
          second draft is kept for review.
        </p>
      </section>
    </div>
  );
}
