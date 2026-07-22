"use client";

// Platform-aware keyboard-shortcut labels for the app's ⌘/Ctrl chords (add-row,
// week navigation). Kept in one place so every visible <kbd> hint matches the
// key the window-level listeners actually check.

import { useEffect, useState } from "react";

/**
 * Formats a shortcut for display: Apple devices use the bare glyph (`⌘K`),
 * everything else the `Ctrl+K` convention.
 *
 * SSR and the FIRST client render return the Apple form so server/client markup
 * matches (no hydration mismatch); a post-mount effect corrects it to `Ctrl+…`
 * on non-Apple platforms — the same "read the browser after mount" pattern as
 * <AuthStatus/>. Returns a `combo(key)` helper, e.g. `combo("[")` → `"⌘["` or
 * `"Ctrl+["`.
 */
export function usePlatformShortcut(): (key: string) => string {
  const [isApple, setIsApple] = useState(true);
  useEffect(() => {
    const platform = navigator.platform || navigator.userAgent;
    if (!/Mac|iPhone|iPad|iPod/.test(platform)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsApple(false);
    }
  }, []);
  return (key: string) => (isApple ? `⌘${key}` : `Ctrl+${key}`);
}
