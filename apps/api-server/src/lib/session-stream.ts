import type { AgentSessionStep } from "@workspace/db";

type Listener = (step: AgentSessionStep) => void;

const subs = new Map<number, Set<Listener>>();

export function subscribeToSession(sessionId: number, listener: Listener): () => void {
  if (!subs.has(sessionId)) {
    subs.set(sessionId, new Set());
  }
  subs.get(sessionId)!.add(listener);
  return () => {
    const set = subs.get(sessionId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        subs.delete(sessionId);
      }
    }
  };
}

export function emitStep(sessionId: number, step: AgentSessionStep) {
  const listeners = subs.get(sessionId);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(step);
    } catch {
      // ignore listener errors
    }
  }
}
