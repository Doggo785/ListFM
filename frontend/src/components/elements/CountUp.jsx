import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

const DURATION_SECONDS = 0.6;

/** A number that counts to its value, then glides on from there when the value changes. */
export default function CountUp({ to, separator = "" }) {
  const ref = useRef(null);
  const current = useRef(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const show = (value) => {
      current.current = value;
      const text = Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
      ref.current.textContent = text.replace(/,/g, separator);
    };
    if (reducedMotion) {
      show(to);
      return undefined;
    }
    const animation = animate(current.current, to, { duration: DURATION_SECONDS, ease: "easeOut", onUpdate: show });
    return () => animation.stop();
  }, [to, separator, reducedMotion]);

  return <span ref={ref}>0</span>;
}
