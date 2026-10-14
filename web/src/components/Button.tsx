import type { ComponentProps } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-bg hover:bg-accent-hover',
  secondary: 'border border-border bg-raised text-text hover:border-muted',
  ghost: 'text-muted hover:bg-raised hover:text-text',
  danger: 'border border-border text-danger hover:border-danger',
};

export function buttonClass(variant: Variant = 'secondary'): string {
  return `inline-flex h-9 items-center justify-center gap-2 rounded-control px-3 text-sm font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]}`;
}

// React 19 passes ref as a prop, so ComponentProps includes it.
interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
}

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return <button type={type} className={`${buttonClass(variant)} ${className}`} {...props} />;
}
