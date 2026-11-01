import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Edit3,
  Radio,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCollection, useDocument, useOnline, useResumeKey } from "./hooks";
import { refs, joinRole, setReady } from "./store";
import {
  ordered,
  nextScene,
  scenePosition,
  readyIntent,
  isReadyForRevision,
  type ReadinessStatus,
  type Production,
  type Role,
  type Scene,
  type Performer,
  type RoleNote,
} from "./domain";
import { SceneEditor } from "./SceneEditor";
export function Volunteer({
  productionId,
  token,
  onExit,
}: {
  productionId: string;
  token: string;
  onExit: () => void;
}) {
  const production = useDocument<Production>(refs.production(productionId)),
    rolesState = useCollection<Role>(refs.roles(productionId)),
    scenesState = useCollection<Scene>(refs.scenes(productionId)),
    performersState = useCollection<Performer>(refs.performers(productionId));
  const [roleId, setRoleId] = useState(
      localStorage.getItem(`backstage-role-${productionId}`) ?? "",
    ),
    [viewId, setViewId] = useState(""),
    [editing, setEditing] = useState(false),
    [pendingId, setPendingId] = useState<string | null>(null),
    [showOrder, setShowOrder] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const lastLive = useRef(""),
    wasConnected = useRef(false),
    resumeKey = useResumeKey(),
    lastResumeKey = useRef(resumeKey),
    online = useOnline(),
    p = production.value,
    roles = ordered(rolesState.value),
    scenes = ordered(scenesState.value),
    role = roles.find((r) => r.id === roleId),
    view = scenes.find((s) => s.id === viewId),
    upcoming = nextScene(scenes, p?.liveSceneId ?? null),
    nextAfterView = nextScene(scenes, viewId),
    note = useDocument<RoleNote>(
      role && view ? refs.note(productionId, view.id, role.id) : null,
    ),
    ready = useDocument<ReadinessStatus>(
      role && upcoming ? refs.status(productionId, upcoming.id, role.id) : null,
    );
  useEffect(() => {
    if (roleId && !role && rolesState.loaded) {
      setRoleId("");
      localStorage.removeItem(`backstage-role-${productionId}`);
    }
  }, [roleId, role, rolesState.loaded, productionId]);
  const firstSceneId = scenes[0]?.id,
    liveConnected = Boolean(
      online && production.loaded && !production.cache && !production.error,
    ),
    readySynchronized = Boolean(
      liveConnected &&
      ready.loaded &&
      !ready.cache &&
      !ready.error &&
      !scenesState.cache &&
      !scenesState.error,
    ),
    currentlyReady =
      readySynchronized && isReadyForRevision(ready.value, p?.liveRevision);
  useEffect(() => {
    const reconnected = liveConnected && !wasConnected.current,
      resumed = resumeKey !== lastResumeKey.current;
    lastResumeKey.current = resumeKey;
    wasConnected.current = liveConnected;
    if (!p || !firstSceneId) return;
    const live = `${productionId}:${roleId}:${p.liveRevision}:${p.liveSceneId}`;
    if (
      live !== lastLive.current ||
      reconnected ||
      resumed ||
      (!editing && pendingId !== null)
    ) {
      lastLive.current = live;
      const target = p.liveSceneId ?? firstSceneId;
      if (editing) {
        setPendingId(target);
      } else {
        setViewId(target);
        setPendingId(null);
        setShowOrder(false);
      }
    }
  }, [
    productionId,
    roleId,
    pendingId,
    p?.liveRevision,
    p?.liveSceneId,
    firstSceneId,
    editing,
    liveConnected,
    resumeKey,
  ]);
  const connection =
    online &&
    !production.cache &&
    !scenesState.cache &&
    !rolesState.cache &&
    !note.cache &&
    !ready.cache &&
    !production.error
      ? "Connected"
      : online
        ? "Reconnecting"
        : "Offline";
  const dataError =
    rolesState.error ||
    scenesState.error ||
    performersState.error ||
    note.error ||
    ready.error;
  async function chooseRole(id: string) {
    setBusy(true);
    setNotice("");
    try {
      await joinRole(productionId, token, id);
      setRoleId(id);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function closeEdit() {
    setEditing(false);
  }
  async function toggle() {
    if (!p || !role || !upcoming || busy || !readySynchronized) return;
    setBusy(true);
    setNotice("");
    try {
      await setReady(
        productionId,
        upcoming.id,
        role.id,
        p?.liveSceneId ?? null,
        p.liveRevision,
        readyIntent(currentlyReady),
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (production.error)
    return (
      <div className="center-card panel">
        <h2>Access unavailable</h2>
        <p>{production.error}</p>
        <button className="button secondary" onClick={onExit}>
          Back
        </button>
      </div>
    );
  if (!p || !rolesState.loaded || !scenesState.loaded)
    return <div className="loading">Loading backstage…</div>;
  if (!role)
    return (
      <div className="select-shell">
        <div className="brand-mark">B</div>
        <div className="eyebrow gold">{p.year || "PRODUCTION ACCESS"}</div>
        <h1>{p.name}</h1>
        <p className="subtle">Select your role to enter backstage.</p>
        <div className="role-options">
          {roles.map((r) => (
            <button
              key={r.id}
              className="role-option"
              disabled={busy}
              onClick={() => chooseRole(r.id)}
            >
              <span>{r.name}</span>
              <ArrowRight size={20} />
            </button>
          ))}
        </div>
        {!roles.length && (
          <p>
            No roles have been added yet. Ask the show controller to add one.
          </p>
        )}
        {notice && <p className="error">{notice}</p>}
        <button className="text-button" onClick={onExit}>
          Leave production
        </button>
      </div>
    );
  const position = view
      ? scenePosition(scenes, view.id, p.liveSceneId)
      : "live",
    index = scenes.findIndex((s) => s.id === viewId),
    liveIndex = scenes.findIndex((s) => s.id === p.liveSceneId),
    names = new Map(performersState.value.map((x) => [x.id, x.name]));
  return (
    <div className="volunteer-shell">
      <header className="volunteer-header">
        <div className="header-line">
          <div className="wordmark">
            BACKSTAGE <span>/ {p.name}</span>
          </div>
          <span
            className={`connection ${connection === "Connected" ? "good" : "warn"}`}
          >
            {connection === "Connected" ? (
              <Wifi size={14} />
            ) : (
              <WifiOff size={14} />
            )}{" "}
            {connection}
          </span>
        </div>
        <div className="header-main">
          <div>
            <div className="eyebrow">YOUR STATION</div>
            <h1>{role.name}</h1>
          </div>
          <button
            className="role-switch"
            onClick={() => {
              setRoleId("");
              setEditing(false);
            }}
            title="Change role"
          >
            <Users size={17} /> Change role
          </button>
        </div>
        <div className="show-strip">
          <Radio size={16} />
          <span>SHOW LIVE</span>
          <strong>{scenes[liveIndex]?.title ?? "Not started"}</strong>
          <span className="show-number">
            {liveIndex >= 0 ? `SCENE ${liveIndex + 1}` : ""}
          </span>
        </div>
      </header>
      <main className="volunteer-content">
        {pendingId && (
          <div className="alert">
            The show moved to a new scene. Finish saving or discard your edit to
            follow live.
          </div>
        )}
        {notice && (
          <div className="alert">
            {notice}
            <button onClick={() => setNotice("")}>Dismiss</button>
          </div>
        )}
        {dataError && (
          <div className="alert" role="alert">
            Some scene information could not be loaded: {dataError}
          </div>
        )}
        <div className="scene-kicker">
          <span className={`pill ${position}`}>
            {position === "live"
              ? "● LIVE SCENE"
              : position === "next"
                ? "NEXT UP"
                : position === "previous"
                  ? "EARLIER SCENE"
                  : "LATER SCENE"}
          </span>
          <button
            className="text-button"
            onClick={() => setShowOrder(!showOrder)}
          >
            Running order <ChevronDown size={15} />
          </button>
        </div>
        {showOrder && (
          <div className="order-panel panel">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                className={`order-row ${s.id === viewId ? "selected" : ""}`}
                onClick={() => {
                  setViewId(s.id);
                  setShowOrder(false);
                }}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{s.title}</strong>
                {s.id === p.liveSceneId && <small>LIVE</small>}
              </button>
            ))}
          </div>
        )}
        {view ? (
          <article className="scene-card panel">
            <div className="scene-top">
              <span>
                SCENE {String(index + 1).padStart(2, "0")}{" "}
                <span className="scene-total">
                  / {String(scenes.length).padStart(2, "0")}
                </span>
              </span>
              <button
                className="button small secondary"
                onClick={() => setEditing(true)}
                disabled={!online}
              >
                <Edit3 size={15} /> Edit
              </button>
            </div>
            <h2>{view.title}</h2>
            <div className="rule" />
            <section>
              <h3>PERFORMERS & CHARACTERS</h3>
              {!note.loaded ? (
                <p className="empty">Loading performers…</p>
              ) : note.value?.assignments?.length ? (
                <div className="cast-list">
                  {note.value.assignments.map((a, i) => (
                    <div className="cast-row" key={i}>
                      <strong>
                        {names.get(a.performerId) ?? "Performer removed"}
                      </strong>
                      <span>{a.character || "Ensemble"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">No performers listed for this role.</p>
              )}
            </section>
            <section>
              <h3>INSTRUCTIONS</h3>
              {!note.loaded ? (
                <p className="empty">Loading instructions…</p>
              ) : note.value?.notes ? (
                <p className="instructions">{note.value.notes}</p>
              ) : (
                <p className="empty">No instructions for this scene.</p>
              )}
            </section>
          </article>
        ) : (
          <div className="panel empty-card">
            No scenes yet. The controller can add the running order.
          </div>
        )}
        {nextAfterView && (
          <button
            className="up-next panel"
            onClick={() => setViewId(nextAfterView.id)}
          >
            <span>
              <span className="eyebrow">COMING UP</span>
              <strong>
                Scene {index + 2} · {nextAfterView.title}
              </strong>
            </span>
            <ArrowRight size={19} />
          </button>
        )}
        <p className="connection-note">
          {connection === "Connected"
            ? "Changes are shared with your team."
            : "Showing available cached information. Editing and READY require a connection."}
        </p>
      </main>
      <nav className="bottom-nav" aria-label="Scene navigation">
        <button
          onClick={() => setViewId(scenes[index - 1]?.id ?? viewId)}
          disabled={index <= 0 || editing}
        >
          <ArrowLeft size={21} />
          <span>
            PREVIOUS
            <br />
            SCENE
          </span>
        </button>
        <button
          className={`ready-control ${currentlyReady ? "is-ready" : ""}`}
          onClick={toggle}
          disabled={!upcoming || !readySynchronized || busy || editing}
        >
          <span className="ready-light" />
          <span>
            {!readySynchronized && upcoming
              ? "CHECKING…"
              : currentlyReady
                ? "READY"
                : "NOT READY"}
            <small>
              {upcoming
                ? `FOR SCENE ${scenes.findIndex((s) => s.id === upcoming.id) + 1}`
                : "SHOW END"}
            </small>
          </span>
          {currentlyReady && <Check size={17} />}
        </button>
        <button
          onClick={() => setViewId(scenes[index + 1]?.id ?? viewId)}
          disabled={index < 0 || index >= scenes.length - 1 || editing}
        >
          <span>
            NEXT
            <br />
            SCENE
          </span>
          <ArrowRight size={21} />
        </button>
      </nav>
      {editing && view && role && (
        <SceneEditor
          key={`${view.id}_${role.id}`}
          productionId={productionId}
          sceneId={view.id}
          roleId={role.id}
          performers={performersState.value}
          note={note.value}
          onClose={closeEdit}
          onSaved={closeEdit}
        />
      )}
    </div>
  );
}
