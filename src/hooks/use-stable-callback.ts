import { useCallback, useRef } from "react";

export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const callbackRef = useRef(callback);

  // Keep the latest callback available immediately during render. Some callers use
  // this helper for render callbacks, so waiting for an effect would render stale
  // state for one commit.
  callbackRef.current = callback;

  return useCallback((...args: Args) => {
    return callbackRef.current(...args);
  }, []);
}
