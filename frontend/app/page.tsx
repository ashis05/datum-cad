export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 p-8 text-center dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Text-to-CAD
      </h1>
      <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Scaffold is up. The 3D viewport and prompt UI land in the next phases.
      </p>
      <p className="text-sm text-zinc-400 dark:text-zinc-500">
        Phase A — monorepo running. Backend health:{" "}
        <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          GET :4000/health
        </code>
      </p>
    </main>
  );
}
