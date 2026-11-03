import type { components, operations } from './schema';

type Schemas = components['schemas'];

export type GameSummary = Schemas['GameSummaryDto'];
export type GameDetail = Schemas['GameDetailDto'];
export type GamePage = Schemas['GamePageDto'];
export type Genre = Schemas['GenreDto'];
export type Review = Schemas['ReviewDto'];
export type ReviewPage = Schemas['ReviewPageDto'];
export type LibraryEntry = Schemas['LibraryEntryDto'];
export type LibraryPage = Schemas['LibraryPageDto'];
export type LibraryStatus = Schemas['SetLibraryStatusDto']['status'];
export type Profile = Schemas['PublicProfileDto'];
export type Account = Schemas['UserResponseDto'];
export type AccessToken = Schemas['AccessTokenResponseDto'];
export type ProblemDetails = Schemas['ProblemDetailsDto'];
export type GameSort = NonNullable<
  NonNullable<operations['GamesController_list']['parameters']['query']>['sort']
>;

export const LIBRARY_STATUSES: readonly LibraryStatus[] = [
  'PLAYING',
  'BACKLOG',
  'COMPLETED',
  'DROPPED',
];
