import { RotateCw } from 'lucide-react';
import { ApiError } from '../api/api-error';
import { Button } from './Button';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

// A human message and, when the API answered, its request id, so a report can be traced.
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const message =
    error instanceof ApiError ? error.message : 'Something went wrong while showing this page.';
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div role="alert" className="rounded-card border border-border bg-surface p-6">
      <p className="text-sm">{message}</p>
      {requestId !== undefined && (
        <p className="mt-1 text-xs text-muted">
          Request id <span className="font-mono">{requestId}</span>
        </p>
      )}
      {onRetry !== undefined && (
        <Button className="mt-4" onClick={onRetry}>
          <RotateCw size={16} strokeWidth={1.5} aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}
