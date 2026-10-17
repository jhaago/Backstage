import { useEffect, useRef, useState } from "react";
import { ArrowRight, LockKeyhole, Radio } from "lucide-react";
import { configured, auth } from "./firebase";
import { useAuth } from "./hooks";
import { isAdmin, login, resolveInvite } from "./store";
import { Volunteer } from "./Volunteer";
import { Admin } from "./Admin";
export function App() {
  const [url, setUrl] = useState(
      window.location.pathname + window.location.search,
    ),
    [productionId, setProductionId] = useState(""),
    [admin, setAdmin] = useState(false),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    user = useAuth(),
    lastJoin = useRef("");
  const token = new URLSearchParams(url.split("?")[1] ?? "").get("join"),
    isAdminRoute = url.startsWith("/admin");
  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setUrl(path);
    setError("");
    setProductionId("");
  }
  useEffect(() => {
    const pop = () => {
      setUrl(window.location.pathname + window.location.search);
      setProductionId("");
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (
      user === undefined ||
      !token ||
      !configured ||
      lastJoin.current === token
    )
      return;
    lastJoin.current = token;
    resolveInvite(token)
      .then(setProductionId)
      .catch((e) => {
        setError(e.message);
        lastJoin.current = "";
      });
  }, [user, token]);
  useEffect(() => {
    if (!isAdminRoute || !user) return;
    isAdmin(user)
      .then(setAdmin)
      .catch(() => setAdmin(false));
  }, [isAdminRoute, user?.uid]);
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const credential = await login(email, password);
      if (!(await isAdmin(credential.user))) {
        await auth.signOut();
        throw new Error("This account is not authorised as a show controller.");
      }
      setAdmin(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!configured)
    return (
      <div className="entry-shell">
        <div className="entry-card panel">
          <div className="brand-icon large">B</div>
          <span className="eyebrow gold">SETUP REQUIRED</span>
          <h1>BACKSTAGE</h1>
          <p>
            Firebase configuration has not been added. Copy{" "}
            <code>.env.example</code> to <code>.env</code> and follow the README
            to connect a Firebase project.
          </p>
        </div>
      </div>
    );
  if (user === undefined)
    return <div className="loading">Opening BACKSTAGE…</div>;
  if (token)
    return productionId ? (
      <Volunteer
        productionId={productionId}
        token={token}
        onExit={() => navigate("/")}
      />
    ) : (
      <div className="entry-shell">
        <div className="entry-card panel">
          <div className="brand-icon large">B</div>
          <h1>Joining production</h1>
          <p>{error || "Connecting to your production…"}</p>
          {error && (
            <button className="button secondary" onClick={() => navigate("/")}>
              Back to start
            </button>
          )}
        </div>
      </div>
    );
  if (isAdminRoute)
    return admin && user ? (
      <Admin
        onExit={() => {
          setAdmin(false);
          navigate("/");
        }}
      />
    ) : (
      <div className="entry-shell">
        <div className="entry-card panel">
          <div className="brand-icon large">B</div>
          <span className="eyebrow gold">PROTECTED ACCESS</span>
          <h1>Show controller</h1>
          <p>Sign in with your administrator account.</p>
          <form onSubmit={signIn} className="entry-form">
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="button primary full" disabled={busy}>
              <LockKeyhole size={17} />
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <button className="text-button" onClick={() => navigate("/")}>
            Back to start
          </button>
        </div>
      </div>
    );
  return (
    <div className="entry-shell">
      <div className="entry-card panel">
        <div className="brand-icon large">B</div>
        <span className="eyebrow gold">LIVE PRODUCTION COORDINATION</span>
        <h1>BACKSTAGE</h1>
        <p>
          A clear view of who’s on, what’s next, and whether your team is ready.
        </p>
        <div className="entry-options">
          <button className="entry-option" onClick={() => navigate("/admin")}>
            <span>
              <Radio size={20} />
              <strong>Show controller</strong>
              <small>Manage the production and run the show</small>
            </span>
            <ArrowRight size={20} />
          </button>
          <div className="entry-option informational">
            <span>
              <strong>Backstage volunteer</strong>
              <small>
                Open the private production link sent by your controller to
                select your role.
              </small>
            </span>
          </div>
        </div>
      </div>
      <footer className="entry-footer">
        BUILT FOR THE MOMENTS BEHIND THE CURTAIN
      </footer>
    </div>
  );
}
