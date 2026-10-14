import { useQuery } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { ownReviewQuery, useDeleteReview, useSaveReview } from '../api/queries';
import type { Review } from '../api/types';
import { Button } from './Button';
import { RatingInput } from './RatingBar';
import { ErrorState } from './ErrorState';

const BODY_MIN = 10;
const BODY_MAX = 2000;

export function ReviewForm({ slug }: { slug: string }) {
  const own = useQuery(ownReviewQuery(slug));
  if (own.isPending) {
    return <div className="skeleton h-48 rounded-card border border-border" aria-hidden />;
  }
  if (own.isError) {
    return <ErrorState error={own.error} onRetry={() => void own.refetch()} />;
  }
  // Keyed by the saved review, so the form resets to it after a save or a delete.
  return <Form key={own.data?.updatedAt ?? 'new'} slug={slug} existing={own.data} />;
}

function Form({ slug, existing }: { slug: string; existing: Review | null }) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? '');
  const [touched, setTouched] = useState(false);
  const save = useSaveReview(slug);
  const remove = useDeleteReview(slug);

  const trimmed = body.trim();
  const ratingError = rating === 0 ? 'Choose a rating from 1 to 5.' : undefined;
  const bodyError =
    trimmed.length < BODY_MIN
      ? `Write at least ${String(BODY_MIN)} characters.`
      : trimmed.length > BODY_MAX
        ? `Keep it under ${String(BODY_MAX)} characters.`
        : undefined;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setTouched(true);
    if (ratingError !== undefined || bodyError !== undefined) {
      return;
    }
    save.mutate({ rating, body: trimmed });
  };

  const error = save.error ?? remove.error;
  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4"
    >
      <h2 className="font-display text-base font-bold">
        {existing === null ? 'Write a review' : 'Your review'}
      </h2>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Rating</span>
        <RatingInput
          value={rating}
          onChange={setRating}
          describedBy={touched && ratingError !== undefined ? 'rating-error' : undefined}
        />
        {touched && ratingError !== undefined && (
          <p id="rating-error" className="text-xs text-danger">
            {ratingError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-body" className="text-sm font-medium">
          Review
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          rows={5}
          maxLength={BODY_MAX}
          aria-invalid={touched && bodyError !== undefined}
          aria-describedby="review-body-message"
          className="rounded-control border border-border bg-bg p-3 text-sm text-text hover:border-muted aria-invalid:border-danger"
        />
        <p
          id="review-body-message"
          className={`text-xs tabular-nums ${touched && bodyError !== undefined ? 'text-danger' : 'text-muted'}`}
        >
          {touched && bodyError !== undefined
            ? bodyError
            : `${String(trimmed.length)} / ${String(BODY_MAX)} characters, plain text`}
        </p>
      </div>
      {error !== null && <ErrorState error={error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : existing === null ? 'Publish review' : 'Save changes'}
        </Button>
        {existing !== null && (
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
          >
            Delete review
          </Button>
        )}
      </div>
    </form>
  );
}
