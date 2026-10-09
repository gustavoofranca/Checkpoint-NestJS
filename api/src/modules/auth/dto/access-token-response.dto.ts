export interface AccessTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  // Seconds, as in OAuth 2.0 token responses.
  expiresIn: number;
}
