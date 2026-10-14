# 0011. Metrics, error reporting and audit logs

- Status: accepted
- Date: 2026-10-13

## Context

The API needs to be operable by someone who did not write it: request latency and errors per
endpoint, whether the cache works, whether the daily sync ran, and a trail of security events. Two
constraints shape the design. The catalog sync runs in a separate worker process with no HTTP
server (`docs/adr/0010`), and none of this may leak passwords, tokens or personal data.

## Decision

- **Prometheus metrics at `GET /api/v1/metrics`**, from `@prometheus-io/client` (the Prometheus
  project's Node.js client, formerly `prom-client`, which is now deprecated), on a registry owned
  by the app rather than the library's global one.
  - `http_request_duration_seconds{method, route, status_code}`: `route` is the matched route
    pattern (`/api/v1/games/:slug`), never the URL, so label values stay few and carry no ids or
    search terms. Measured by Express middleware registered before routing, so responses from
    guards, the rate limiter and body parsing are counted too.
  - `checkpoint_cache_requests_total{result}` from the cache service's counters.
  - Sync metrics are **read from `sync_runs` when Prometheus scrapes**: finished runs by outcome,
    whether one is running, the last run's duration and the time of the last success. The worker
    serves no metrics endpoint; the table already holds the truth, and alerting on "no success in
    26 hours" needs nothing else.
  - `checkpoint_sync_queue_jobs{state}` from BullMQ, bounded by a 1 s timeout.
  - `checkpoint_metrics_source_up{source}` is 0 when PostgreSQL or Redis could not answer during
    a scrape: those series are skipped and the rest is still served.
  - Default process metrics (CPU, memory, event loop lag, GC).
- **Access by `METRICS_TOKEN`**, a separate bearer token compared in constant time (SHA-256
  digests and `timingSafeEqual`). User access tokens are not accepted, admin ones included:
  metrics are for the monitoring system, not for accounts. Without `METRICS_TOKEN` the endpoint
  answers 404.
- **Sentry with `@sentry/node`, only when `SENTRY_DSN` is set.** Without it the SDK is never
  initialized and nothing leaves the process. 5xx responses (tagged with the request id and the
  user id) and failed sync jobs are reported. The SDK's defaults would send request bodies,
  cookies, headers, query strings and the local variables of stack frames, so every data
  collection category is switched off, and `beforeSend` keeps only the URL path, the method and
  three harmless headers, and reduces the user to its id. No tracing.
- **Audit events as log lines** (`audit` field): register, login success and failure, refresh
  token reuse, logout, admin starting a sync. They carry ids only. nestjs-pino binds the request
  to every line logged while it is handled, so each event has the request id without passing it
  around. A failed login records the user id only when the email matched an account.
- **Request log line**: pino-http's line now includes the route pattern and the user id.

## Consequences

- Prometheus must send `Authorization: Bearer <METRICS_TOKEN>`; a leaked token exposes
  operational numbers, not user data.
- A scrape costs three small queries on `sync_runs` and one Redis call.
- An event the scrubber does not know about could still carry data; the e2e test sends a request
  with a body, a query string, cookies and custom headers and checks that none reach Sentry.
- Audit events live in the application logs; keeping and querying them is the log platform's job.

## Alternatives considered

- **Pushgateway or a metrics port in the worker**: another moving part for numbers the database
  already has.
- **Requiring an ADMIN access token for `/metrics`**: Prometheus would need a user account and a
  refresh flow.
- **`@sentry/nestjs`**: adds tracing and its own exception filter; the existing Problem Details
  filter already sees every error.
- **An audit table**: durable and queryable, but a schema change for a requirement logs meet.
