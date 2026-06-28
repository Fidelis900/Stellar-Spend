import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const errorRate = new Rate('normal_errors');
const apiDuration = new Trend('normal_api_duration', true);
const successCount = new Counter('normal_successful_requests');

export const options = {
  scenarios: {
    normal_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '5m', target: 25 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<800'],
    'http_req_failed': ['rate<0.01'],
    'normal_errors': ['rate<0.01'],
    'normal_api_duration': ['p(95)<500'],
  },
};

export default function () {
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/api/health`, { timeout: '5s' });
    const ok = check(res, {
      'health 200': (r) => r.status === 200,
      'health latency < 200ms': (r) => r.timings.duration < 200,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'health' });
    ok ? successCount.add(1) : errorRate.add(1);
  });

  group('Currencies', () => {
    const res = http.get(`${BASE_URL}/api/offramp/currencies`, { timeout: '5s' });
    const ok = check(res, {
      'currencies 200': (r) => r.status === 200,
      'currencies latency < 400ms': (r) => r.timings.duration < 400,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'currencies' });
    ok ? successCount.add(1) : errorRate.add(1);
  });

  group('Rate', () => {
    const res = http.get(`${BASE_URL}/api/offramp/rate`, { timeout: '5s' });
    const ok = check(res, {
      'rate 200': (r) => r.status === 200,
      'rate latency < 300ms': (r) => r.timings.duration < 300,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'rate' });
    ok ? successCount.add(1) : errorRate.add(1);
  });

  group('Quote', () => {
    const payload = JSON.stringify({ amount: '100', currency: 'NGN', feeMethod: 'USDC' });
    const params = { headers: { 'Content-Type': 'application/json' }, timeout: '10s' };
    const res = http.post(`${BASE_URL}/api/offramp/quote`, payload, params);
    const ok = check(res, {
      'quote < 500': (r) => r.status < 500,
      'quote latency < 1000ms': (r) => r.timings.duration < 1000,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'quote' });
    ok ? successCount.add(1) : errorRate.add(1);
  });

  sleep(2);
}
