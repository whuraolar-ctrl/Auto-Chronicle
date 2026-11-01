import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** Animation length in milliseconds. */
  duration?: number;
  /** Custom text, for example money. Receives the number being shown. */
  format?: (value: number) => string;
}

/** Counts up from the previous value to the new one. Skips motion if the user prefers reduced motion. */
export default function AnimatedNumber({
  value,
  duration = 1100,
  format,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const shown = useRef(0);

  useEffect(() => {
    const from = shown.current;
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (reduceMotion || from === value) {
      shown.current = value;
      setDisplay(value);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out
      const next = from + (value - from) * eased;
      shown.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span>{format ? format(display) : Math.round(display).toLocaleString()}</span>
  );
}
