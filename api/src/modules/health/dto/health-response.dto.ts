export type DependencyStatus = 'up' | 'down';

export interface LivenessResponse {
  status: 'ok';
}

export interface ReadinessResponse {
  status: 'ok';
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
}
