/**
 * Performance Monitoring - SLO Tracking and Alerting
 */

import { sloConfig, SLO } from './slo-config';

interface MetricPoint {
  timestamp: number;
  value: number;
}

interface SLOStatus {
  name: string;
  objective: number;
  current_value: number;
  error_budget_remaining: number;
  burn_rate: number;
  status: 'healthy' | 'warning' | 'critical';
}

class PerformanceMonitor {
  private metrics: Map<string, MetricPoint[]> = new Map();
  private alertHistory: Map<string, number> = new Map();

  /**
   * Record a metric value for SLO tracking
   */
  recordMetric(sloName: string, value: number): void {
    const points = this.metrics.get(sloName) || [];
    points.push({ timestamp: Date.now(), value });
    // Keep last 1000 points
    if (points.length > 1000) {
      points.shift();
    }
    this.metrics.set(sloName, points);
  }

  /**
   * Get current SLO status
   */
  getSLOStatus(sloName: string): SLOStatus | null {
    const slo = sloConfig.find(s => s.name === sloName);
    if (!slo) return null;

    const points = this.metrics.get(sloName) || [];
    if (points.length === 0) {
      return {
        name: sloName,
        objective: slo.objective,
        current_value: 1.0,
        error_budget_remaining: 1.0,
        burn_rate: 0,
        status: 'healthy',
      };
    }

    const recentPoints = points.slice(-100);
    const goodEvents = recentPoints.filter(p => p.value >= slo.objective).length;
    const totalEvents = recentPoints.length;
    const currentValue = totalEvents > 0 ? goodEvents / totalEvents : 1.0;

    // Calculate burn rate
    const errorBudget = 1 - slo.objective;
    const errors = recentPoints.filter(p => p.value < slo.objective).length;
    const errorRate = totalEvents > 0 ? errors / totalEvents : 0;
    const burnRate = errorBudget > 0 ? errorRate / errorBudget : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (burnRate >= slo.burn_rate_thresholds.critical) {
      status = 'critical';
    } else if (burnRate >= slo.burn_rate_thresholds.warning) {
      status = 'warning';
    }

    return {
      name: sloName,
      objective: slo.objective,
      current_value: currentValue,
      error_budget_remaining: Math.max(0, 1 - errorRate / errorBudget),
      burn_rate: burnRate,
      status,
    };
  }

  /**
   * Check all SLOs and trigger alerts if needed
   */
  checkAllSLOs(): void {
    for (const slo of sloConfig) {
      const status = this.getSLOStatus(slo.name);
      if (!status) continue;

      const alertKey = `${slo.name}:${status.status}`;
      const lastAlert = this.alertHistory.get(alertKey) || 0;

      if (status.status !== 'healthy' && Date.now() - lastAlert > 300000) {
        // Alert every 5 minutes
        this.triggerAlert(slo, status);
        this.alertHistory.set(alertKey, Date.now());
      }
    }
  }

  /**
   * Trigger an alert for an SLO
   */
  private triggerAlert(slo: SLO, status: SLOStatus): void {
    const severity = status.status === 'critical' ? 'CRITICAL' : 'WARNING';
    const message = `
[${severity}] SLO Alert: ${slo.name}
  Description: ${slo.description}
  Objective: ${(slo.objective * 100).toFixed(1)}%
  Current Value: ${(status.current_value * 100).toFixed(1)}%
  Error Budget Remaining: ${(status.error_budget_remaining * 100).toFixed(1)}%
  Burn Rate: ${status.burn_rate.toFixed(2)}
  Runbook: ${slo.alerting.runbook_url}
`;

    console.error(message);

    // Send to alerting system
    if (typeof window !== 'undefined' && window.fetch) {
      // Send to backend alerting endpoint
      fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: status.status,
          slo: slo.name,
          message,
          timestamp: new Date().toISOString(),
        }),
      }).catch(console.error);
    }
  }

  /**
   * Get SLO dashboard data
   */
  getDashboardData(): {
    slos: SLOStatus[];
    summary: {
      healthy: number;
      warning: number;
      critical: number;
      total: number;
    };
  } {
    const slos = sloConfig.map(slo => this.getSLOStatus(slo.name)).filter(Boolean) as SLOStatus[];
    const summary = {
      healthy: slos.filter(s => s.status === 'healthy').length,
      warning: slos.filter(s => s.status === 'warning').length,
      critical: slos.filter(s => s.status === 'critical').length,
      total: slos.length,
    };
    return { slos, summary };
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export SLO config for use in other modules
export { sloConfig };
