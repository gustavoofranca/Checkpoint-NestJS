// Load test of the public catalog reads (docs/SPEC.md: p95 under 50 ms cached and under 200 ms
// uncached, on the seed dataset). Run it with load/run.sh, which starts the built API and
// invalidates the catalog cache first.
//
// Two scenarios over the same URLs: every game page and a set of list queries.
// - uncached: each URL requested exactly once, right after the cache was invalidated, so every
//   response comes from PostgreSQL.
// - cached: then 200 requests a second for 30 s, picking URLs at random, all served from Redis.
//
// Each request carries a random X-Forwarded-For (the API runs with TRUST_PROXY_HOPS=1), so the
// per-IP rate limit does not throttle a test that comes from one machine.
import { check } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000/api/v1';
const SEARCHES = ['the', 'war', 'star', 'dark', 'space', 'city', 'super', 'world'];
// Upper bound for the uncached scenario, whose iteration count is fixed before setup() builds
// the URL list; iterations past the end of the list request nothing.
const MAX_URLS = 1000;

export const options = {
  scenarios: {
    uncached: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: MAX_URLS,
      maxDuration: '20s',
    },
    cached: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 50,
      startTime: '20s',
    },
  },
  thresholds: {
    'http_req_duration{scenario:uncached}': ['p(95)<200'],
    'http_req_duration{scenario:cached}': ['p(95)<50'],
    'http_req_failed{scenario:uncached}': ['rate==0'],
    'http_req_failed{scenario:cached}': ['rate==0'],
    // A run that sent nothing would pass every bound above.
    'http_reqs{scenario:uncached}': ['count>200'],
    'http_reqs{scenario:cached}': ['count>5000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function randomIp() {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

function get(url, tags) {
  return http.get(url, { headers: { 'X-Forwarded-For': randomIp() }, tags });
}

// Collects the URLs to request. Its own list requests use limit=50, which no test URL uses, so
// they warm no cache entry the uncached scenario will read.
export function setup() {
  const slugs = [];
  let cursor = null;
  do {
    const query = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const page = get(`${BASE_URL}/games?limit=50&sort=title${query}`, { name: 'setup' }).json();
    slugs.push(...page.data.map((game) => game.slug));
    cursor = page.nextCursor;
  } while (cursor !== null);
  const genres = get(`${BASE_URL}/genres`, { name: 'setup' })
    .json()
    .data.map((genre) => genre.slug);

  const urls = slugs.map((slug) => `${BASE_URL}/games/${slug}`);
  for (const sort of ['newest', 'top_rated', 'title']) {
    urls.push(`${BASE_URL}/games?limit=20&sort=${sort}`);
    for (const genre of genres) {
      urls.push(`${BASE_URL}/games?limit=20&sort=${sort}&genre=${genre}`);
    }
  }
  for (const search of SEARCHES) {
    urls.push(`${BASE_URL}/games?limit=20&q=${search}`);
  }
  if (urls.length > MAX_URLS) {
    exec.test.abort(`${urls.length} URLs: raise MAX_URLS`);
  }
  return { urls };
}

export default function (data) {
  let url;
  if (exec.scenario.name === 'uncached') {
    url = data.urls[exec.scenario.iterationInTest];
    if (url === undefined) {
      return;
    }
  } else {
    url = data.urls[Math.floor(Math.random() * data.urls.length)];
  }
  const response = get(url, { name: url.includes('/games/') ? 'game' : 'list' });
  check(response, { 'status is 200': (r) => r.status === 200 });
}
