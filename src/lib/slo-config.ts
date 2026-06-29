/**
 * SLO Configuration for Stellar-Spend
 * Defines Service Level Objectives for critical flows
 */

export interface SLO {
  name: string;
  description: string;
  sli: {
    metric: string;
    good_events: string;
    total_events: string;
  };
  objective: number;
  window: string;
  burn_rate_thresholds: {
    critical: number;  // Fast burn rate (e.g., 14.4 for 1h burn)
    warning: number;   // Slow burn rate (e.g., 6 for 6h burn)
  };
  alerting: {
    critical_duration: string;
    warning_duration: string;
    runbook_url: string;
  };
}

export const sloConfig: SLO[] = [
  {
    name: 'api-availability',
    description: 'API request success rate',
    sli: {
      metric: 'http_requests_total',
      good_events: 'status_code < 500',
      total_events: 'status_code >= 100',
    },
    objective: 0.999, // 99.9% availability
    window: '30d',
    burn_rate_thresholds: {
      critical: 14.4, // 1h burn rate
      warning: 6,     // 6h burn rate
    },
    alerting: {
      critical_duration: '1h',
      warning_duration: '6h',
      runbook_url: 'https://github.com/Lex-Studios/Stellar-Spend/docs/runbooks/api-availability.md',
    },
  },
  {
    name: 'payout-success-rate',
    description: 'Payout transaction success rate',
    sli: {
      metric: 'payout_requests_total',
      good_events: 'status = "success"',
      total_events: 'status != ""',
    },
    objective: 0.995, // 99.5% success rate
    window: '30d',
    burn_rate_thresholds: {
      critical: 14.4,
      warning: 6,
    },
    alerting: {
      critical_duration: '1h',
      warning_duration: '6h',
      runbook_url: 'https://github.com/Lex-Studios/Stellar-Spend/docs/runbooks/payout-failures.md',
    },
  },
  {
    name: 'api-latency',
    description: 'API p95 latency',
    sli: {
      metric: 'http_request_duration_seconds',
      good_events: 'le < 2',
      total_events: 'le < 10',
    },
    objective: 0.95, // 95% of requests under 2s
    window: '30d',
    burn_rate_thresholds: {
      critical: 14.4,
      warning: 6,
    },
    alerting: {
      critical_duration: '1h',
      warning_duration: '6h',
      runbook_url: 'https://github.com/Lex-Studios/Stellar-Spend/docs/runbooks/api-latency.md',
    },
  },
  {
    name: 'indexer-lag',
    description: 'Indexer lag time',
    sli: {
      metric: 'indexer_lag_seconds',
      good_events: 'value < 60',
      total_events: 'value < 3600',
    },
    objective: 0.99, // 99% of time under 60s lag
    window: '30d',
    burn_rate_thresholds: {
      critical: 14.4,
      warning: 6,
    },
    alerting: {
      critical_duration: '1h',
      warning_duration: '6h',
      runbook_url: 'https://github.com/Lex-Studios/Stellar-Spend/docs/runbooks/indexer-lag.md',
    },
  },
];

export const getSLOByName = (name: string): SLO | undefined => {
  return sloConfig.find(slo => slo.name === name);
};
