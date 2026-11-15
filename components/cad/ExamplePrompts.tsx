import { ArrowUpRight } from "lucide-react";

export const EXAMPLES = [
  "A 40×20×10 mm plate with a centered 5 mm hole",
  "Flanged pipe fitting: 60 mm flange, 8 mm thick, four bolt holes, 30 mm tube rising 40 mm, 20 mm bore",
  "L-bracket, 50 mm legs, 5 mm thick, 40 mm wide, one 6 mm hole in each leg",
  "Hex standoff: 10 mm across flats, 25 mm tall, 3 mm hole through",
  "Round tray: 90 mm diameter, 15 mm tall, 2 mm walls, 3 mm floor",
];

export default function ExamplePrompts({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="fade-up px-1 pt-2">
      <h2 className="text-lg font-semibold tracking-tight text-text">Describe a part.</h2>
      <p className="mt-1.5 text-[13px] leading-5 text-text-2">
        Write what you need in plain English. You get an exact, parametric solid you can resize and export as STEP or STL.
      </p>
      <p className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">Try an example</p>
      <ul className="flex flex-col gap-2">
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(ex)}
              className="group flex w-full items-start justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-2.5 text-left text-[13px] leading-5 text-text-2 transition-colors hover:border-line-strong hover:bg-panel-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-panel disabled:hover:text-text-2"
            >
              <span>{ex}</span>
              <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-text-3 transition-colors group-hover:text-accent group-disabled:group-hover:text-text-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
