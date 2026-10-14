import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { RatingBar, RatingInput } from './RatingBar';

function widths(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('.bg-accent')].map((bar) => bar.style.width);
}

function Controlled() {
  const [value, setValue] = useState(0);
  return <RatingInput value={value} onChange={setValue} />;
}

describe('RatingBar', () => {
  it('fills whole segments and the fraction of the next one', () => {
    const { container } = render(<RatingBar value={3.6} />);

    expect(widths(container).map((width) => Math.round(Number.parseFloat(width)))).toEqual([
      100, 100, 100, 60, 0,
    ]);
  });
});

describe('RatingInput', () => {
  it('is a radio group that the arrow keys move through', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('radio', { name: '3 out of 5' }));
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radiogroup', { name: 'Rating' })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '4 out of 5' }).checked).toBe(true);
  });
});
