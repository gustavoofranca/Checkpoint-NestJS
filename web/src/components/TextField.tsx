import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string;
}

export function TextField({ label, error, hint, id, ...props }: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error !== undefined}
        aria-describedby={message === undefined ? undefined : messageId}
        className="h-10 rounded-control border border-border bg-bg px-3 text-sm text-text transition-colors duration-150 ease-out placeholder:text-muted hover:border-muted aria-invalid:border-danger"
        {...props}
      />
      {message !== undefined && (
        <p
          id={messageId}
          className={`text-xs ${error === undefined ? 'text-muted' : 'text-danger'}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
