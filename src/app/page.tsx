"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.replace("/homepage.html");
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", margin: 0, padding: 0, overflow: "hidden", position: "fixed", top: 0, left: 0, zIndex: 999999, background: "#ffffff" }}>
      <iframe
        src="/homepage.html"
        style={{ width: "100%", height: "100%", border: "none" }}
        title="BEANSHEAL"
      />
    </div>
  );
}