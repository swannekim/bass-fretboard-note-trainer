import { useEffect, useState } from "react";

/**
 * Every trainer page is a dark, full-viewport instrument: force the dark
 * theme and lock document scrolling while mounted, and report whether the
 * phone is being held in portrait (the board wants landscape).
 */
export function useTrainerChrome(): { portrait: boolean } {
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark", "bft-lock");
    return () => root.classList.remove("dark", "bft-lock");
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return { portrait };
}
