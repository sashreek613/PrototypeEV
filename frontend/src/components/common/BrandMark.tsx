interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size = 28 }: BrandMarkProps) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[7px] bg-vo-accent text-[#06231b]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 16 16" width={size * 0.55} height={size * 0.55} fill="none" aria-hidden>
        <path d="M8 1.5 3 8h3.2L6.4 14.5 13 7.2H9.4L8 1.5Z" fill="currentColor" />
      </svg>
    </span>
  );
}
