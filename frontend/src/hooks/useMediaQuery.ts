import { useEffect, useState } from "react";

type MatchMedia = (query: string) => MediaQueryList;

/** Reactive CSS media query. Treated as "no match" where matchMedia is unavailable. */
function matchMediaFn(): MatchMedia | undefined {
  return (window as { matchMedia?: MatchMedia }).matchMedia?.bind(window);
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMediaFn()?.(query).matches ?? false);
  useEffect(() => {
    const list = matchMediaFn()?.(query);
    if (!list) return;
    const onChange = () => {
      setMatches(list.matches);
    };
    onChange();
    list.addEventListener("change", onChange);
    return () => {
      list.removeEventListener("change", onChange);
    };
  }, [query]);
  return matches;
}
