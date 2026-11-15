"use client";

// Client wrapper that dynamically imports the kernel stage with { ssr: false }.
// Replicad/OpenCascade WASM cannot run on the server, and Next 15+ only allows
// ssr:false in a client component — hence this thin boundary.

import dynamic from "next/dynamic";

const CadStage = dynamic(() => import("./CadStage"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-[#0b0f17] text-sm text-zinc-400">
      Initializing viewport…
    </div>
  ),
});

export default function CadApp() {
  return <CadStage />;
}
