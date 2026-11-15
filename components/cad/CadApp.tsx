"use client";

// Client wrapper that dynamically imports the kernel stage with { ssr: false }.
// Replicad/OpenCascade WASM cannot run on the server, and Next 15+ only allows
// ssr:false in a client component — hence this thin boundary.

import dynamic from "next/dynamic";
import TopBar from "./TopBar";

const CadStage = dynamic(() => import("./CadStage"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar status="loading" />
      <div className="viewport-bg flex-1" />
    </div>
  ),
});

export default function CadApp() {
  return <CadStage />;
}
