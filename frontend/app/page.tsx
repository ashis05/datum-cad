import CadApp from "@/components/cad/CadApp";

export default function Home() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline gap-3 border-b border-zinc-800 bg-[#0b0f17] px-5 py-3">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-50">Text-to-CAD</h1>
        <span className="text-xs text-zinc-500">
          Phase H — Web Worker kernel · self-correct · sliders · export
        </span>
      </header>
      <CadApp />
    </main>
  );
}
