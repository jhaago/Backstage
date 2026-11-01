import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";
import { listenDoc, listenList } from "./store";
import type {
  DocumentReference,
  CollectionReference,
} from "firebase/firestore";
export function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}
type One<T> = {
  path: string;
  value: T | null;
  cache: boolean;
  error: string;
  loaded: boolean;
};
type Many<T> = {
  path: string;
  value: T[];
  cache: boolean;
  error: string;
  loaded: boolean;
};
// Mobile browsers can suspend Firestore listeners or leave an errored listener
// stopped. Reattach when the app wakes or connectivity returns.
export function useResumeKey() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== "hidden") setKey((value) => value + 1);
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return key;
}
export function useDocument<T>(reference: DocumentReference | null) {
  const resumeKey = useResumeKey(),
    path = reference?.path ?? "",
    empty: One<T> = {
      path,
      value: null,
      cache: false,
      error: "",
      loaded: false,
    };
  const [state, setState] = useState<One<T>>(empty);
  useEffect(() => {
    setState((previous) =>
      reference && previous.path === path
        ? { ...previous, cache: true, error: "" }
        : { path, value: null, cache: false, error: "", loaded: false },
    );
    if (!reference) return;
    return listenDoc<T>(
      reference,
      (value, cache) =>
        setState({ path, value, cache, error: "", loaded: true }),
      (e) => setState((x) => ({ ...x, error: e.message, loaded: true })),
    );
  }, [path, resumeKey]);
  return state.path === path ? state : empty;
}
export function useCollection<T>(reference: CollectionReference | null) {
  const resumeKey = useResumeKey(),
    path = reference?.path ?? "",
    empty: Many<T> = {
      path,
      value: [],
      cache: false,
      error: "",
      loaded: false,
    };
  const [state, setState] = useState<Many<T>>(empty);
  useEffect(() => {
    setState((previous) =>
      reference && previous.path === path
        ? { ...previous, cache: true, error: "" }
        : { path, value: [], cache: false, error: "", loaded: false },
    );
    if (!reference) return;
    return listenList<T>(
      reference,
      (value, cache) =>
        setState({ path, value, cache, error: "", loaded: true }),
      (e) => setState((x) => ({ ...x, error: e.message, loaded: true })),
    );
  }, [path, resumeKey]);
  return state.path === path ? state : empty;
}
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
