import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
// Soak duration: default 30 min, override with SOAK_DURATION env var
const SOAK_DURATION = __ENV.SOAK_DURATION || '30m';

const errorRate = new Rate('soak_errors');
const apiDuration = new Trend('soak_api_duration', true);
const successCount = new Counter('soak_successful_requests');
const poolSaturation = new Gauge('soak_pool_saturation');

export const options = {
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: SOAK_DURATION, target: 10 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Tighter latency expectations for sustained load
    'http_req_duration': ['p(95)<600', 'p(99)<1200'],
    'http_req_failed': ['rate<0.01'],
    'soak_errors': ['rate<0.01'],
    // Memory / pool leaks manifest as rising p99
    'soak_api_duration': ['p(99)<1500'],
  },
};

let requestCycle = 0;

export default function () {
  requestCycle++;
  // Simulate DB pool saturation gauge: VU count as proxy
  poolSaturation.add(__VU);

  group('Health (soak)', () => {
    const res = http.get(`${BASE_URL}/api/health`, { timeout: '5s' });
    const ok = check(res, {
      'health 200': (r) => r.status === 200,
      'no memory leak signal': (r) => r.timings.duration < 300,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'health' });
    ok ? successCount.add(1) : errorRate.add(1);
  });

  // Rotate endpoints to exercise all DB pool paths
  if (requestCycle % 3 === 0) {
    group('Currencies (soak)', () => {
      const res = http.get(`${BASE_URL}/api/offramp/currencies`, { timeout: '5s' });
      const ok = check(res, { 'currencies 200': (r) => r.status === 200 });
      apiDuration.add(res.timings.duration, { endpoint: 'currencies' });
      ok ? successCount.add(1) : errorRate.add(1);
    });
  }

  if (requestCycle % 5 === 0) {
    group('Quote (soak)', () => {
      const currencies = ['NGN', 'KES'];
      const currency = currencies[requestCycle % currencies.length];
      const payload = JSON.stringify({ amount: '100', currency, feeMethod: 'USDC' });
      const params = { headers: { 'Content-Type': 'application/json' }, timeout: '10s' };
      const res = http.post(`${BASE_URL}/api/offramp/quote`, payload, params);
      const ok = check(res, { 'quote < 500': (r) => r.status < 500 });
      apiDuration.add(res.timings.duration, { endpoint: 'quote' });
      ok ? successCount.add(1) : errorRate.add(1);
    });
  }

  group('Rate (soak)', () => {
    const res = http.get(`${BASE_URL}/api/offramp/rate`, { timeout: '5s' });
    const ok = check(res, { 'rate 200': (r) => r.status === 200 });
    apiDuration.add(res.timings.duration, { endpoint: 'rate' });
    ok ? successCount.add(1) : errorRate.add(1);
  });

  sleep(3);
}
