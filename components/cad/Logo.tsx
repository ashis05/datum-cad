export default function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <g stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" />
        <path d="M12 12 3.5 7.25M12 12l8.5-4.75M12 12v9.5" />
      </g>
    </svg>
  );
}
