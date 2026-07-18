"use client";

import { useEffect, useRef } from "react";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";

export function BracketClient() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dispose: undefined | (() => void);
    void import("./vue/mount").then(({ mountBracketApp }) => {
      if (mountRef.current) dispose = mountBracketApp(mountRef.current);
    });
    return () => dispose?.();
  }, []);

  return (
    <div ref={mountRef}>
      <div className="boot-screen" aria-live="polite">
        <span className="boot-mark">BRACKET</span>
        <span>Preparing your tournament…</span>
      </div>
    </div>
  );
}
