"use client";
import { useCallback, useLayoutEffect, useRef } from "react";
// Stable identity for memoized rows, with the latest committed callback.
export function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const latest = useRef(callback);
  useLayoutEffect(() => { latest.current = callback; });
  return useCallback((...args: Args) => latest.current(...args), []);
}
