import { useId, useState } from 'react';
import { formatRating, plural } from '../lib/format';

const SEGMENTS = [1, 2, 3, 4, 5] as const;

// How full segment `index` (1–5) is for a value from 0 to 5: 3.6 fills three segments and 60% of
// the fourth.
function fill(value: number, index: number): number {
  return Math.min(Math.max(value - (index - 1), 0), 1);
}

interface RatingBarProps {
  value: number;
  size?: 'sm' | 'md';
}

// The rating as a five-segment bar, like a health or progress bar. Decorative: callers give the
// number in text next to it.
export function RatingBar({ value, size = 'sm' }: RatingBarProps) {
  const segment = size === 'sm' ? 'h-1.5 w-3.5' : 'h-2.5 w-7';
  return (
    <span aria-hidden className="inline-flex gap-0.5">
      {SEGMENTS.map((index) => (
        <span key={index} className={`${segment} overflow-hidden rounded-[2px] bg-raised`}>
          <span
            className="block h-full bg-accent"
            style={{ width: `${String(fill(value, index) * 100)}%` }}
          />
        </span>
      ))}
    </span>
  );
}

// The game's average with its bar, or a muted note when nobody has reviewed it.
export function RatingSummary({ average, count }: { average: number; count: number }) {
  if (count === 0) {
    return <span className="text-xs text-muted">No reviews yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted tabular-nums">
      <RatingBar value={average} />
      <span>
        <span className="font-semibold text-text">{formatRating(average)}</span>
        <span className="sr-only"> out of 5</span> ({plural(count, 'review', 'reviews')})
      </span>
    </span>
  );
}

interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
  describedBy?: string | undefined;
}

// Five radio buttons drawn as segments: arrow keys move between them, as in any radio group, and
// hovering previews the rating before the click.
export function RatingInput({ value, onChange, describedBy }: RatingInputProps) {
  const name = useId();
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? value;
  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      aria-describedby={describedBy}
      className="flex items-center gap-3"
      onMouseLeave={() => {
        setPreview(null);
      }}
    >
      <div className="flex gap-1">
        {SEGMENTS.map((index) => (
          <label
            key={index}
            className="cursor-pointer rounded-[3px] py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
            onMouseEnter={() => {
              setPreview(index);
            }}
          >
            <input
              type="radio"
              name={name}
              value={index}
              checked={value === index}
              onChange={() => {
                onChange(index);
              }}
              className="sr-only"
            />
            <span
              aria-hidden
              className={`block h-3 w-9 rounded-[3px] transition-colors duration-100 ease-out ${
                index <= shown ? 'bg-accent' : 'bg-raised'
              }`}
              style={{ transitionDelay: `${String((index - 1) * 20)}ms` }}
            />
            <span className="sr-only">{`${String(index)} out of 5`}</span>
          </label>
        ))}
      </div>
      <span className="font-display text-lg font-bold tabular-nums" aria-hidden>
        {shown === 0 ? '–' : `${String(shown)}/5`}
      </span>
    </div>
  );
}
