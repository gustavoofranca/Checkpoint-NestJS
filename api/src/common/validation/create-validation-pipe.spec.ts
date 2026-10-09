import type { ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { flattenValidationErrors } from './create-validation-pipe';

function validationError(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return { property, children, ...(constraints === undefined ? {} : { constraints }) };
}

describe('flattenValidationErrors', () => {
  it('turns each constraint into a field error', () => {
    const errors = [
      validationError('rating', {
        isInt: 'rating must be an integer number',
        max: 'rating must not be greater than 5',
      }),
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'rating', message: 'rating must be an integer number' },
      { field: 'rating', message: 'rating must not be greater than 5' },
    ]);
  });

  it('uses a dotted path for nested properties', () => {
    const errors = [
      validationError('filters', undefined, [
        validationError('genre', { isString: 'genre must be a string' }),
      ]),
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'filters.genre', message: 'genre must be a string' },
    ]);
  });

  it('returns nothing for no errors', () => {
    expect(flattenValidationErrors([])).toEqual([]);
  });
});
