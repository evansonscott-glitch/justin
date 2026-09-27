"use client";

/** A random, non-identifying session id kept in this browser only. */
export function getSessionId(key = "justin-session"): string {
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function resetSessionId(key = "justin-session"): string {
  const id = crypto.randomUUID();
  try {
    localStorage.setItem(key, id);
  } catch {}
  return id;
}
