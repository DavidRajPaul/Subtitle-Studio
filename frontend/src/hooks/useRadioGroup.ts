import { useCallback, useLayoutEffect, useRef, type KeyboardEvent } from "react";

const radios = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>(':scope > [role="radio"], :scope > * > [role="radio"]')].filter((r) => !r.disabled);

/**
 * Standard keyboard behaviour for a group of choices built from buttons with role="radio":
 * one Tab stop for the whole group (the chosen item), arrow keys move and choose,
 * Home/End jump to the first/last.
 */
export function useRadioGroup<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = radios(root);
    const chosen = items.find((r) => r.getAttribute("aria-checked") === "true") ?? items.at(0);
    for (const r of root.querySelectorAll<HTMLElement>('[role="radio"]')) r.tabIndex = r === chosen ? 0 : -1;
  });
  const onKeyDown = useCallback((e: KeyboardEvent<T>) => {
    const root = ref.current;
    if (!root || !(e.target instanceof HTMLElement) || e.target.getAttribute("role") !== "radio") return;
    const items = radios(root);
    const at = items.indexOf(e.target as HTMLButtonElement);
    if (at < 0) return;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (at + 1) % items.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (at - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    items[next].focus();
    items[next].click();
  }, []);
  return { ref, onKeyDown };
}
