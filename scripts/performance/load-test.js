import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration', true);
const successfulRequests = new Counter('successful_requests');
const activeConnections = new Gauge('active_connections');
const dbPoolSaturation = new Gauge('db_pool_saturation');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.1'],
    'errors': ['rate<0.05'],
    'api_duration': ['p(95)<500'],
  },
};

export default function () {
  activeConnections.add(__VU);
  // Proxy for DB pool saturation: VU count relative to expected max pool size (10)
  dbPoolSaturation.add(Math.min((__VU / 10) * 100, 100));

  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/api/health`, { timeout: '5s' });
    const ok = check(res, {
      'health status is 200': (r) => r.status === 200,
      'health response time < 200ms': (r) => r.timings.duration < 200,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'health' });
    ok ? successfulRequests.add(1) : errorRate.add(1);
  });

  group('Quote API', () => {
    const payload = JSON.stringify({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'USDC',
    });
    const params = { headers: { 'Content-Type': 'application/json' }, timeout: '10s' };
    const res = http.post(`${BASE_URL}/api/offramp/quote`, payload, params);
    const ok = check(res, {
      'quote status < 500': (r) => r.status < 500,
      'quote response time < 1000ms': (r) => r.timings.duration < 1000,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'quote' });
    ok ? successfulRequests.add(1) : errorRate.add(1);
  });

  group('Order API', () => {
    // Exercises the full quote→order path; expects reachable endpoint
    const payload = JSON.stringify({
      amount: '100',
      currency: 'NGN',
      feeMethod: 'USDC',
      accountNumber: '0123456789',
      bankCode: 'GTB',
    });
    const params = { headers: { 'Content-Type': 'application/json' }, timeout: '15s' };
    const res = http.post(`${BASE_URL}/api/offramp/order`, payload, params);
    check(res, {
      'order endpoint reachable': (r) => r.status < 500,
      'order response time < 2000ms': (r) => r.timings.duration < 2000,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'order' });
  });

  group('Currencies API', () => {
    const res = http.get(`${BASE_URL}/api/offramp/currencies`, { timeout: '5s' });
    const ok = check(res, {
      'currencies status is 200': (r) => r.status === 200,
      'currencies is array': (r) => Array.isArray(r.json()),
      'currencies response time < 500ms': (r) => r.timings.duration < 500,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'currencies' });
    ok ? successfulRequests.add(1) : errorRate.add(1);
  });

  group('Rate API', () => {
    const res = http.get(`${BASE_URL}/api/offramp/rate`, { timeout: '5s' });
    const ok = check(res, {
      'rate status is 200': (r) => r.status === 200,
      'rate response time < 300ms': (r) => r.timings.duration < 300,
    });
    apiDuration.add(res.timings.duration, { endpoint: 'rate' });
    ok ? successfulRequests.add(1) : errorRate.add(1);
  });

  sleep(1);
}
