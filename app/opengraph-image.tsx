import { ImageResponse } from "next/og";

export const alt = "CAD Designer — Describe a part. Get a real solid.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const lines: React.ReactNode[] = [];
  for (let i = 1; i < 25; i++)
    lines.push(
      <div key={`v${i}`} style={{ position: "absolute", left: i * 50, top: 0, width: 1, height: 630, background: i % 5 === 0 ? "#1f3a46" : "#171b22" }} />,
    );
  for (let i = 1; i < 13; i++)
    lines.push(
      <div key={`h${i}`} style={{ position: "absolute", top: i * 50, left: 0, height: 1, width: 1200, background: i % 5 === 0 ? "#1f3a46" : "#171b22" }} />,
    );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0e12", position: "relative", fontFamily: "sans-serif" }}>
        {lines}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 96px", position: "relative" }}>
          <svg width="112" height="112" viewBox="0 0 32 32" fill="none">
            <g stroke="#4cc9f0" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
              <path d="M16 3.5 26 9.25v13.5L16 28.5 6 22.75V9.25Z" />
              <path d="M16 16 6 9.25M16 16l10-6.75M16 16v12.5" />
            </g>
          </svg>
          <div style={{ marginTop: 40, fontSize: 88, fontWeight: 700, color: "#e8ebf0", letterSpacing: -2 }}>CAD Designer</div>
          <div style={{ marginTop: 12, fontSize: 40, color: "#9aa3b2" }}>Describe a part. Get a real solid.</div>
          <div style={{ marginTop: 48, fontSize: 26, color: "#4cc9f0", fontFamily: "monospace" }}>
            prompt → Replicad → OpenCascade → STEP / STL
          </div>
        </div>
      </div>
    ),
    size,
  );
}
