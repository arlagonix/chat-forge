import { useSyncExternalStore } from "react";

const RELATIVE_TIME_UPDATE_INTERVAL_MS = 60_000;

let currentNowMs = Date.now();
let intervalId: number | null = null;
const listeners = new Set<() => void>();

function emitRelativeTimeNow() {
  currentNowMs = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (intervalId === null) {
    intervalId = window.setInterval(
      emitRelativeTimeNow,
      RELATIVE_TIME_UPDATE_INTERVAL_MS,
    );
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot() {
  return currentNowMs;
}

export function useRelativeTimeNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
