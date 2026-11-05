import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { createRibbon, sceneFor } from "@/lib/pixelRibbon";

const EMBER_STEPS = 9;

/** Mounted once for the whole app, so changing page morphs the ribbon instead of restarting it. */
export default function PixelRibbon() {
  const canvas = useRef(null);
  const ribbon = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const palette = Array.from({ length: EMBER_STEPS }, (_, i) => styles.getPropertyValue(`--ember-${i + 1}`));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const instance = createRibbon(canvas.current, { palette, ink: styles.getPropertyValue("--ground"), reducedMotion });
    ribbon.current = instance;
    return () => instance.destroy();
  }, []);

  useEffect(() => {
    ribbon.current.setScene(sceneFor(pathname));
  }, [pathname]);

  return <canvas ref={canvas} className="pixel-ribbon" aria-hidden="true" />;
}
