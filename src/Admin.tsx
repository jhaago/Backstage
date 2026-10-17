import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  ExternalLink,
  FileJson,
  LogOut,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  Trash2,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useCollection, useDocument, useOnline } from "./hooks";
import {
  refs,
  createProduction,
  addRole,
  addScene,
  addPerformer,
  updateNamed,
  reorder,
  duplicateScene,
  duplicateProduction,
  deleteScene,
  archiveProduction,
  setActiveProduction,
  invitationFor,
  rotateInvite,
  advance,
  copyRoles,
  importProduction,
  signOut,
} from "./store";
import {
  ordered,
  nextScene,
  duplicateNames,
  type Production,
  type Role,
  type Scene,
  type Performer,
  type RoleNote,
} from "./domain";
import { parseImport, type ImportData } from "./import";
import { SceneEditor } from "./SceneEditor";
export function Admin({ onExit }: { onExit: () => void }) {
  const productionsState = useCollection<Production>(refs.productions()),
    active = useDocument<{ activeProductionId: string | null }>(
      doc(db, "config", "current"),
    );
  const [selectedId, setSelectedId] = useState(""),
    [tab, setTab] = useState<"control" | "setup">("control"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState<string | null>(null),
    [newName, setNewName] = useState(""),
    [newYear, setNewYear] = useState(""),
    [importData, setImportData] = useState<ImportData | null>(null),
    [previewId, setPreviewId] = useState(""),
    [editRole, setEditRole] = useState("");
  const productions = productionsState.value,
    selected =
      selectedId ||
      active.value?.activeProductionId ||
      productions.find((p) => !p.archived)?.id ||
      productions[0]?.id ||
      "",
    production = useDocument<Production>(
      selected ? refs.production(selected) : null,
    ),
    rolesState = useCollection<Role>(selected ? refs.roles(selected) : null),
    scenesState = useCollection<Scene>(selected ? refs.scenes(selected) : null),
    performersState = useCollection<Performer>(
      selected ? refs.performers(selected) : null,
    ),
    notesState = useCollection<RoleNote>(
      selected ? refs.notes(selected) : null,
    ),
    readyState = useCollection<{
      sceneId: string;
      roleId: string;
      ready: boolean;
    }>(selected ? refs.ready(selected) : null);
  const p = production.value,
    roles = ordered(rolesState.value),
    scenes = ordered(scenesState.value),
    liveIndex = scenes.findIndex((s) => s.id === p?.liveSceneId),
    next = nextScene(scenes, p?.liveSceneId ?? null),
    following = next ? nextScene(scenes, next.id) : null,
    preview =
      scenes.find((s) => s.id === previewId) ?? scenes[liveIndex] ?? scenes[0],
    online = useOnline(),
    cooldown = useRef(0);
  useEffect(() => {
    let cancelled = false;
    setInvite(null);
    if (selected)
      invitationFor(selected)
        .then((v) => {
          if (!cancelled) setInvite(v);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [selected]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!newName.trim()) return;
    await action(async () => {
      const result = await createProduction(newName, newYear);
      if (productions.length === 0) await setActiveProduction(result.id);
      setSelectedId(result.id);
      setNewName("");
      setNewYear("");
      setTab("setup");
    });
  }
  async function go(target: string) {
    if (!p || p.archived || busy || Date.now() < cooldown.current) return;
    cooldown.current = Date.now() + 1200;
    await action(() =>
      advance(selected, target, p.liveRevision, p.liveSceneId),
    );
  }
  const link = invite
    ? `${window.location.origin}/?join=${encodeURIComponent(invite)}`
    : "";
  async function readImport(file: File) {
    try {
      setImportData(parseImport(await file.text()));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-icon">B</div>
          <div className="wordmark">
            BACKSTAGE<small>SHOW CONTROL</small>
          </div>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <button
          className={`side-link ${tab === "control" ? "active" : ""}`}
          onClick={() => setTab("control")}
        >
          <Radio size={18} /> Show controller
        </button>
        <button
          className={`side-link ${tab === "setup" ? "active" : ""}`}
          onClick={() => setTab("setup")}
        >
          <Settings2 size={18} /> Production setup
        </button>
        <div className="sidebar-bottom">
          <button
            className="side-link"
            onClick={async () => {
              await signOut(auth);
              onExit();
            }}
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-top">
          <div>
            <span className="eyebrow gold">
              BACKSTAGE /{" "}
              {tab === "control" ? "LIVE OPERATIONS" : "PRODUCTION SETUP"}
            </span>
            <h1>
              {tab === "control" ? "Show controller" : "Production setup"}
            </h1>
          </div>
          <div className="top-actions">
            <span
              className={`connection ${online && !production.cache ? "good" : "warn"}`}
            >
              {online && !production.cache ? (
                <Wifi size={14} />
              ) : (
                <WifiOff size={14} />
              )}{" "}
              {online && !production.cache ? "Connected" : "Reconnecting"}
            </span>
            <select
              aria-label="Select production"
              value={selected}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setPreviewId("");
              }}
            >
              {productions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.archived ? " (Archived)" : ""}
                </option>
              ))}
            </select>
          </div>
        </header>
        {error && (
          <div className="alert admin-alert" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {!p ? (
          <div className="welcome panel">
            <div className="brand-icon large">B</div>
            <h2>Start your first production</h2>
            <p>
              Create a production, then add the roles and scenes your team
              needs.
            </p>
            <div className="inline-form">
              <input
                aria-label="Production name"
                placeholder="Production name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                className="year-input"
                aria-label="Year"
                placeholder="Year (optional)"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
              />
              <button
                className="button primary"
                onClick={create}
                disabled={busy}
              >
                Create production
              </button>
            </div>
          </div>
        ) : tab === "control" ? (
          <div className="control-content">
            <div className="control-grid">
              <div className="control-primary">
                <section className="live-panel panel">
                  <div className="section-heading">
                    <span className="eyebrow">
                      <span className="pulse" /> CURRENTLY LIVE
                    </span>
                    <span className="subtle">{p.name}</span>
                  </div>
                  <div className="live-index">
                    {liveIndex >= 0
                      ? String(liveIndex + 1).padStart(2, "0")
                      : "—"}
                    <span>/{String(scenes.length).padStart(2, "0")}</span>
                  </div>
                  <h2>{scenes[liveIndex]?.title ?? "No live scene"}</h2>
                  <div className="live-divider" />
                  <div className="upcoming-grid">
                    <div>
                      <span className="eyebrow gold">NEXT SCENE</span>
                      <strong>
                        {next
                          ? `${liveIndex + 2}. ${next.title}`
                          : "End of running order"}
                      </strong>
                    </div>
                    <div>
                      <span className="eyebrow">FOLLOWING</span>
                      <strong>
                        {following
                          ? `${liveIndex + 3}. ${following.title}`
                          : "—"}
                      </strong>
                    </div>
                  </div>
                  <button
                    className="go-button"
                    disabled={!next || busy || !online || p.archived}
                    onClick={() => next && go(next.id)}
                  >
                    <span>
                      <small>ADVANCE THE LIVE SHOW</small>GO / NEXT SCENE
                    </span>
                    <ArrowRight size={28} />
                  </button>
                  <p className="fineprint">
                    Updates every connected backstage screen. READY is
                    informational and does not block GO.
                  </p>
                </section>
                <section className="panel readiness">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">UPCOMING SCENE</span>
                      <h3>Team readiness</h3>
                    </div>
                    <span className="muted">
                      {next?.title ?? "No next scene"}
                    </span>
                  </div>
                  <div className="readiness-grid">
                    {roles.map((role) => {
                      const hasInfo = notesState.value.some(
                        (n) =>
                          n.sceneId === next?.id &&
                          n.roleId === role.id &&
                          (n.notes.trim() || n.assignments.length),
                      );
                      const ready = readyState.value.find(
                        (r) => r.sceneId === next?.id && r.roleId === role.id,
                      )?.ready;
                      return (
                        <div className="readiness-row" key={role.id}>
                          <span
                            className={`status-dot ${!hasInfo ? "neutral" : ready ? "on" : "off"}`}
                          />
                          <strong>{role.name}</strong>
                          <span className={ready ? "ready-text" : "muted"}>
                            {!next || !hasInfo
                              ? "Not required"
                              : ready
                                ? "READY"
                                : "Waiting"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {!roles.length && (
                    <p className="empty">Add roles in Production setup.</p>
                  )}
                </section>
              </div>
              <div className="control-secondary">
                <section className="panel running">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">OVERVIEW</span>
                      <h3>Running order</h3>
                    </div>
                    <span className="muted">{scenes.length} scenes</span>
                  </div>
                  <div className="running-list">
                    {scenes.map((s, i) => (
                      <button
                        key={s.id}
                        className={`running-row ${s.id === p.liveSceneId ? "live-row" : ""} ${s.id === preview?.id ? "preview-row" : ""}`}
                        onClick={() => setPreviewId(s.id)}
                      >
                        <span className="running-index">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <strong>{s.title}</strong>
                        {s.id === p.liveSceneId && (
                          <span className="live-tag">LIVE</span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel rehearsal">
                  <span className="eyebrow">REHEARSAL CONTROLS</span>
                  <h3>Move the show</h3>
                  <p>Previewing a row above does not change the live scene.</p>
                  <div className="button-row">
                    <button
                      className="button secondary"
                      disabled={liveIndex <= 0 || busy}
                      onClick={() => go(scenes[liveIndex - 1].id)}
                    >
                      <ArrowLeft size={16} /> Back one
                    </button>
                    <button
                      className="button secondary"
                      disabled={!scenes.length || busy}
                      onClick={() => {
                        if (confirm("Reset the live show to the first scene?"))
                          void go(scenes[0].id);
                      }}
                    >
                      <RotateCcw size={16} /> Reset
                    </button>
                  </div>
                  <button
                    className="button ghost full"
                    disabled={!preview || preview.id === p.liveSceneId || busy}
                    onClick={() => {
                      if (
                        preview &&
                        confirm(
                          `Make Scene ${scenes.indexOf(preview) + 1} — ${preview.title} live on all devices?`,
                        )
                      )
                        void go(preview.id);
                    }}
                  >
                    Make previewed scene live
                  </button>
                </section>
              </div>
            </div>
            {preview && (
              <section className="panel preview-details">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">
                      CONTROLLER PREVIEW · SCENE {scenes.indexOf(preview) + 1}
                    </span>
                    <h3>{preview.title}</h3>
                  </div>
                  <span className="muted">All role information</span>
                </div>
                <div className="role-preview-grid">
                  {roles.map((r) => {
                    const n = notesState.value.find(
                      (x) => x.sceneId === preview.id && x.roleId === r.id,
                    );
                    return (
                      <div key={r.id} className="role-preview">
                        <strong>{r.name}</strong>
                        <p>{n?.notes || "No instructions for this scene."}</p>
                        {n?.assignments?.map((a, i) => (
                          <div className="tiny-cast" key={i}>
                            {performersState.value.find(
                              (x) => x.id === a.performerId,
                            )?.name ?? "Removed"}{" "}
                            · {a.character || "Ensemble"}
                          </div>
                        ))}
                        <button
                          className="text-button"
                          onClick={() => setEditRole(r.id)}
                        >
                          Edit information <Edit3 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="setup-content">
            <section className="panel production-settings">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">PRODUCTION</span>
                  <h3>{p.name}</h3>
                </div>
                <span className="muted">{p.year || "No year set"}</span>
              </div>
              <div className="settings-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    const name = prompt("Production name", p.name);
                    if (name?.trim())
                      void action(() =>
                        updateDoc(refs.production(selected), {
                          name: name.trim(),
                        }),
                      );
                  }}
                >
                  Rename
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    const year = prompt("Year (optional)", p.year);
                    if (year !== null)
                      void action(() =>
                        updateDoc(refs.production(selected), {
                          year: year.trim(),
                        }),
                      );
                  }}
                >
                  Edit year
                </button>
                <button
                  className="button secondary"
                  onClick={() => action(() => setActiveProduction(selected))}
                  disabled={active.value?.activeProductionId === selected}
                >
                  Set active
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    action(() =>
                      duplicateProduction(p).then((v) => setSelectedId(v.id)),
                    )
                  }
                >
                  <Copy size={16} /> Duplicate
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    action(() => archiveProduction(selected, !p.archived))
                  }
                >
                  <Archive size={16} /> {p.archived ? "Restore" : "Archive"}
                </button>
              </div>
              <p className="fineprint">
                {active.value?.activeProductionId === selected
                  ? "This is the active production."
                  : "This production is separate from the currently active show."}
              </p>
            </section>
            <div className="setup-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">YOUR TEAM</span>
                    <h3>Backstage roles</h3>
                  </div>
                  <Users size={19} />
                </div>
                <div className="manage-list">
                  {roles.map((r) => (
                    <div className="manage-row" key={r.id}>
                      <strong>{r.name}</strong>
                      <div className="row-actions">
                        <button
                          aria-label={`Move ${r.name} up`}
                          onClick={() =>
                            action(() =>
                              reorder(selected, "roles", roles, r.id, -1),
                            )
                          }
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          aria-label={`Move ${r.name} down`}
                          onClick={() =>
                            action(() =>
                              reorder(selected, "roles", roles, r.id, 1),
                            )
                          }
                        >
                          <ChevronDown size={18} />
                        </button>
                        <button
                          aria-label={`Rename ${r.name}`}
                          onClick={() => {
                            const name = prompt("Role name", r.name);
                            if (name?.trim())
                              void action(() =>
                                updateNamed(selected, "roles", r.id, name),
                              );
                          }}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          aria-label={`Remove ${r.name}`}
                          onClick={() => {
                            if (
                              confirm(
                                `Remove ${r.name}? Its old notes will no longer appear.`,
                              )
                            )
                              void action(() =>
                                deleteDoc(doc(refs.roles(selected), r.id)),
                              );
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="inline-form">
                  <input
                    id="role-name"
                    placeholder="New role"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const input = e.currentTarget;
                        void action(async () => {
                          if (input.value.trim()) {
                            await addRole(selected, input.value, roles.length);
                            input.value = "";
                          }
                        });
                      }
                    }}
                  />
                  <button
                    className="button secondary"
                    onClick={() => {
                      const input = document.getElementById(
                        "role-name",
                      ) as HTMLInputElement;
                      void action(async () => {
                        if (input.value.trim()) {
                          await addRole(selected, input.value, roles.length);
                          input.value = "";
                        }
                      });
                    }}
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
                {productions.filter((x) => x.id !== selected).length > 0 && (
                  <div className="inline-form">
                    <select
                      id="copy-roles"
                      aria-label="Copy roles from production"
                    >
                      <option value="">Copy roles from…</option>
                      {productions
                        .filter((x) => x.id !== selected)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                    <button
                      className="button secondary"
                      onClick={() => {
                        const src = (
                          document.getElementById(
                            "copy-roles",
                          ) as HTMLSelectElement
                        ).value;
                        if (src) void action(() => copyRoles(src, selected));
                      }}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">RUNNING ORDER</span>
                    <h3>Scenes</h3>
                  </div>
                  <span className="muted">{scenes.length} total</span>
                </div>
                <div className="manage-list">
                  {scenes.map((s, i) => (
                    <div className="manage-row" key={s.id}>
                      <span className="order-num">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <strong>{s.title}</strong>
                      <div className="row-actions">
                        <button
                          aria-label={`Move ${s.title} up`}
                          onClick={() =>
                            action(() =>
                              reorder(selected, "scenes", scenes, s.id, -1),
                            )
                          }
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          aria-label={`Move ${s.title} down`}
                          onClick={() =>
                            action(() =>
                              reorder(selected, "scenes", scenes, s.id, 1),
                            )
                          }
                        >
                          <ChevronDown size={18} />
                        </button>
                        <button
                          aria-label={`Rename ${s.title}`}
                          onClick={() => {
                            const name = prompt("Scene title", s.title);
                            if (name?.trim())
                              void action(() =>
                                updateNamed(selected, "scenes", s.id, name),
                              );
                          }}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          aria-label={`Duplicate ${s.title}`}
                          onClick={() =>
                            action(() => duplicateScene(selected, s, roles))
                          }
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          aria-label={`Delete ${s.title}`}
                          onClick={() => {
                            if (confirm(`Delete Scene ${i + 1} — ${s.title}?`))
                              void action(() =>
                                deleteScene(selected, s.id, scenes, p),
                              );
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="inline-form">
                  <input
                    id="scene-title"
                    placeholder="New scene title"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const input = e.currentTarget;
                        void action(async () => {
                          if (input.value.trim()) {
                            await addScene(
                              selected,
                              input.value,
                              scenes.length,
                            );
                            input.value = "";
                          }
                        });
                      }
                    }}
                  />
                  <button
                    className="button secondary"
                    onClick={() => {
                      const input = document.getElementById(
                        "scene-title",
                      ) as HTMLInputElement;
                      void action(async () => {
                        if (input.value.trim()) {
                          await addScene(selected, input.value, scenes.length);
                          input.value = "";
                        }
                      });
                    }}
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
              </section>
            </div>
            <div className="setup-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">SHARED DIRECTORY</span>
                    <h3>Performers</h3>
                  </div>
                  <span className="muted">
                    {performersState.value.length} names
                  </span>
                </div>
                <div className="manage-list compact">
                  {performersState.value
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((person) => (
                      <div className="manage-row" key={person.id}>
                        <strong>{person.name}</strong>
                        <div className="row-actions">
                          <button
                            aria-label={`Rename ${person.name}`}
                            onClick={() => {
                              const name = prompt(
                                "Performer name",
                                person.name,
                              );
                              if (name?.trim())
                                void action(() =>
                                  updateNamed(
                                    selected,
                                    "performers",
                                    person.id,
                                    name,
                                  ),
                                );
                            }}
                          >
                            <Edit3 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="inline-form">
                  <input id="performer-name" placeholder="New performer name" />
                  <button
                    className="button secondary"
                    onClick={() => {
                      const input = document.getElementById(
                        "performer-name",
                      ) as HTMLInputElement;
                      const name = input.value.trim();
                      if (duplicateNames(name, performersState.value).length) {
                        setError("A performer with that name already exists.");
                        return;
                      }
                      void action(async () => {
                        if (name) {
                          await addPerformer(selected, name);
                          input.value = "";
                        }
                      });
                    }}
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
              </section>
              <section className="panel access-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">VOLUNTEER ACCESS</span>
                    <h3>Private production link</h3>
                  </div>
                  <ExternalLink size={18} />
                </div>
                <p>
                  Share this link with your team. They select a role when they
                  open it. Anyone with the link can choose any role.
                </p>
                <div className="link-box">{link || "Loading link…"}</div>
                <div className="button-row">
                  <button
                    className="button secondary"
                    disabled={!link}
                    onClick={() =>
                      navigator.clipboard
                        .writeText(link)
                        .then(() => setError("Link copied to clipboard."))
                        .catch((e) => setError(e.message))
                    }
                  >
                    Copy link
                  </button>
                  <button
                    className="button ghost"
                    onClick={() => {
                      if (
                        confirm(
                          "Replace the production link? Existing volunteer sessions will lose server access until they open the new link.",
                        )
                      )
                        void action(async () =>
                          setInvite(await rotateInvite(selected)),
                        );
                    }}
                  >
                    Replace link
                  </button>
                </div>
                <p className="fineprint">
                  Keep this link within your team. Replacing it revokes the old
                  link and enrolled sessions on their next server request.
                </p>
              </section>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">SCENE INFORMATION</span>
                  <h3>Edit any role</h3>
                </div>
              </div>
              <div className="inline-form">
                <select
                  value={preview?.id ?? ""}
                  onChange={(e) => setPreviewId(e.target.value)}
                  aria-label="Choose scene to edit"
                >
                  {scenes.map((s, i) => (
                    <option key={s.id} value={s.id}>
                      Scene {i + 1} — {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="role-preview-grid">
                {roles.map((r) => {
                  const n = notesState.value.find(
                    (x) => x.sceneId === preview?.id && x.roleId === r.id,
                  );
                  return (
                    <div className="role-preview" key={r.id}>
                      <strong>{r.name}</strong>
                      <p>{n?.notes || "No instructions for this scene."}</p>
                      <button
                        className="text-button"
                        disabled={!preview}
                        onClick={() => setEditRole(r.id)}
                      >
                        Edit <Edit3 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="panel import-panel">
              <div>
                <span className="eyebrow">OPTIONAL SETUP</span>
                <h3>
                  <FileJson size={20} /> Import a running order
                </h3>
                <p>
                  Import a documented JSON file as a new, separate production.
                  Review its contents before applying.
                </p>
              </div>
              <input
                type="file"
                accept=".json,application/json"
                aria-label="Import JSON file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readImport(f);
                }}
              />
              {importData && (
                <div className="import-review">
                  <strong>{importData.name}</strong>
                  <p>
                    {importData.roles.length} roles · {importData.scenes.length}{" "}
                    scenes · {importData.performers?.length ?? 0} listed
                    performers
                  </p>
                  <ol>
                    {importData.scenes.map((s, i) => (
                      <li key={i}>{s.title}</li>
                    ))}
                  </ol>
                  <div className="button-row">
                    <button
                      className="button ghost"
                      onClick={() => setImportData(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="button primary"
                      onClick={() =>
                        action(async () => {
                          const result = await importProduction(importData);
                          setSelectedId(result.id);
                          setImportData(null);
                        })
                      }
                    >
                      Create from import
                    </button>
                  </div>
                </div>
              )}
            </section>
            <section className="panel new-production">
              <h3>Create another production</h3>
              <div className="inline-form">
                <input
                  placeholder="Production name"
                  aria-label="New production name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <input
                  className="year-input"
                  placeholder="Year"
                  aria-label="New production year"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                />
                <button
                  className="button secondary"
                  onClick={create}
                  disabled={busy}
                >
                  <Plus size={16} /> Create
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
      {editRole && preview && (
        <SceneEditor
          key={`${preview.id}_${editRole}`}
          productionId={selected}
          sceneId={preview.id}
          roleId={editRole}
          performers={performersState.value}
          note={
            notesState.value.find(
              (n) => n.sceneId === preview.id && n.roleId === editRole,
            ) ?? null
          }
          onClose={() => setEditRole("")}
          onSaved={() => setEditRole("")}
        />
      )}
    </div>
  );
}
