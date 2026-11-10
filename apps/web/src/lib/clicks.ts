import { useRef } from 'react';

const DOUBLE_MS = 260;

/**
 * One click does `single`, a double click (mouse) does `double`. With a mouse the single action waits a moment to see whether a second click follows;
 * a finger has no double click, so a touch tap acts at once and nothing is delayed on a phone.
 */
export function useClicks(single: () => void, double: () => void) {
  const timer = useRef<number | undefined>(undefined);
  return {
    onClick(e: React.MouseEvent) {
      if (e.detail > 1) return; // the second click of a double click: onDoubleClick handles it
      const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch';
      if (touch) { single(); return; }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(single, DOUBLE_MS);
    },
    onDoubleClick(e: React.MouseEvent) { e.preventDefault(); window.clearTimeout(timer.current); double(); },
  };
}
