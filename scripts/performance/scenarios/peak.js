import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const errorRate = new Rate('peak_errors');
const apiDuration = new Trend('peak_api_duration', true);
const successCount = new Counter('peak_successful_requests');
const concurrentVUs = new Gauge('peak_concurrent_vus');

export const options = {
  scenarios: {
    peak_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 150 },
        { duration: '1m', target: 200 },
        { duration: '1m', target: 200 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<800', 'p(99)<2000'],
    'http_req_failed': ['rate<0.05'],
    'peak_errors': ['rate<0.05'],
    'peak_api_duration': ['p(95)<800'],
  },
};

export default function () {
  concurrentVUs.add(__VU);

  group('Health', () => {
    const res = http.get(`${BASE_URL}/api/health`, { timeout: '5s' });
    const ok = check(res, { 'health 200': (r) => r.status === 200 });
    apiDuration.add(res.timings.duration, { endpoint: 'health' });
    ok ? successCount.add(1) : errorRate.add(1);
  });

  group('Rate (cached)', () => {
    const res = http.get(`${BASE_URL}/api/offramp/rate`, { timeout: '5s' });
    const ok = check(res, {
      'rate 200': (r) => r.status === 200,
      'rate fast under peak': (r) => r.timings.duration < 500,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'rate' });
    ok ? successCount.add(1) : errorRate.add(1);
  });

  group('Quote burst', () => {
    const currencies = ['NGN', 'KES', 'GHS'];
    const currency = currencies[Math.floor(Math.random() * currencies.length)];
    const amounts = ['50', '100', '500', '1000'];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];

    const payload = JSON.stringify({ amount, currency, feeMethod: 'USDC' });
    const params = { headers: { 'Content-Type': 'application/json' }, timeout: '15s' };
    const res = http.post(`${BASE_URL}/api/offramp/quote`, payload, params);
    const ok = check(res, { 'quote < 500': (r) => r.status < 500 });
    apiDuration.add(res.timings.duration, { endpoint: 'quote' });
    ok ? successCount.add(1) : errorRate.add(1);
  });

  group('Order submit (simulated)', () => {
    const payload = JSON.stringify({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'USDC',
      recipientAddress: `0x${Math.random().toString(16).slice(2, 42)}`,
    });
    const params = { headers: { 'Content-Type': 'application/json' }, timeout: '15s' };
    const res = http.post(`${BASE_URL}/api/offramp/quote`, payload, params);
    check(res, { 'order endpoint reachable': (r) => r.status < 500 });
    apiDuration.add(res.timings.duration, { endpoint: 'order' });
  });

  sleep(0.5);
}
