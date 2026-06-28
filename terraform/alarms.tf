# CloudWatch Alarms for SLO Monitoring

# ============================================
# API Availability SLO Alarms
# ============================================

resource "aws_cloudwatch_metric_alarm" "api_availability_slo_warning" {
  alarm_name          = "api-availability-slo-warning"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 6
  metric_name         = "http_requests_success_rate"
  namespace           = "StellarSpend"
  period              = 300
  statistic           = "Average"
  threshold           = 0.999 # 99.9% availability
  alarm_description   = "API availability approaching SLO error budget"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    Service = "api"
    Environment = var.environment
  }

  tags = {
    Name = "api-availability-slo-warning"
    SLO = "api-availability"
    Severity = "warning"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_availability_slo_critical" {
  alarm_name          = "api-availability-slo-critical"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  metric_name         = "http_requests_success_rate"
  namespace           = "StellarSpend"
  period              = 300
  statistic           = "Average"
  threshold           = 0.995 # 99.5% availability (error budget exhausted)
  alarm_description   = "API availability SLO error budget exhausted"
  alarm_actions       = [aws_sns_topic.alerts.arn, aws_sns_topic.oncall.arn]

  dimensions = {
    Service = "api"
    Environment = var.environment
  }

  tags = {
    Name = "api-availability-slo-critical"
    SLO = "api-availability"
    Severity = "critical"
  }
}

# ============================================
# Payout Success Rate SLO Alarms
# ============================================

resource "aws_cloudwatch_metric_alarm" "payout_success_slo_warning" {
  alarm_name          = "payout-success-slo-warning"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 6
  metric_name         = "payout_success_rate"
  namespace           = "StellarSpend"
  period              = 300
  statistic           = "Average"
  threshold           = 0.995 # 99.5% success rate
  alarm_description   = "Payout success rate approaching SLO error budget"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    Service = "payout"
    Environment = var.environment
  }

  tags = {
    Name = "payout-success-slo-warning"
    SLO = "payout-success-rate"
    Severity = "warning"
  }
}

resource "aws_cloudwatch_metric_alarm" "payout_success_slo_critical" {
  alarm_name          = "payout-success-slo-critical"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  metric_name         = "payout_success_rate"
  namespace           = "StellarSpend"
  period              = 300
  statistic           = "Average"
  threshold           = 0.985
  alarm_description   = "Payout success rate SLO error budget exhausted"
  alarm_actions       = [aws_sns_topic.alerts.arn, aws_sns_topic.oncall.arn]

  dimensions = {
    Service = "payout"
    Environment = var.environment
  }

  tags = {
    Name = "payout-success-slo-critical"
    SLO = "payout-success-rate"
    Severity = "critical"
  }
}

# ============================================
# API Latency SLO Alarms
# ============================================

resource "aws_cloudwatch_metric_alarm" "api_latency_slo_warning" {
  alarm_name          = "api-latency-slo-warning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 6
  metric_name         = "api_p95_latency"
  namespace           = "StellarSpend"
  period              = 300
  statistic           = "Average"
  threshold           = 1.8 # 1.8 seconds (approaching 2s limit)
  alarm_description   = "API latency approaching SLO threshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    Service = "api"
    Environment = var.environment
  }

  tags = {
    Name = "api-latency-slo-warning"
    SLO = "api-latency"
    Severity = "warning"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_latency_slo_critical" {
  alarm_name          = "api-latency-slo-critical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "api_p95_latency"
  namespace           = "StellarSpend"
  period              = 300
  statistic           = "Average"
  threshold           = 2.0 # 2 seconds (SLO violation)
  alarm_description   = "API latency SLO violation"
  alarm_actions       = [aws_sns_topic.alerts.arn, aws_sns_topic.oncall.arn]

  dimensions = {
    Service = "api"
    Environment = var.environment
  }

  tags = {
    Name = "api-latency-slo-critical"
    SLO = "api-latency"
    Severity = "critical"
  }
}

# ============================================
# Indexer Lag SLO Alarms
# ============================================

resource "aws_cloudwatch_metric_alarm" "indexer_lag_slo_warning" {
  alarm_name          = "indexer-lag-slo-warning"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 6
  metric_name         = "indexer_lag_seconds"
  namespace           = "StellarSpend"
  period              = 300
  statistic           = "Average"
  threshold           = 45 # 45 seconds (approaching 60s limit)
  alarm_description   = "Indexer lag approaching SLO threshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    Service = "indexer"
    Environment = var.environment
  }

  tags = {
    Name = "indexer-lag-slo-warning"
    SLO = "indexer-lag"
    Severity = "warning"
  }
}

resource "aws_cloudwatch_metric_alarm" "indexer_lag_slo_critical" {
  alarm_name          = "indexer-lag-slo-critical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "indexer_lag_seconds"
  namespace           = "StellarSpend"
  period              = 300
  statistic           = "Average"
  threshold           = 60 # 60 seconds (SLO violation)
  alarm_description   = "Indexer lag SLO violation"
  alarm_actions       = [aws_sns_topic.alerts.arn, aws_sns_topic.oncall.arn]

  dimensions = {
    Service = "indexer"
    Environment = var.environment
  }

  tags = {
    Name = "indexer-lag-slo-critical"
    SLO = "indexer-lag"
    Severity = "critical"
  }
}

# ============================================
# SNS Topics for Alert Routing
# ============================================

resource "aws_sns_topic" "alerts" {
  name = "stellar-spend-alerts"
  
  tags = {
    Name = "stellar-spend-alerts"
    Environment = var.environment
  }
}

resource "aws_sns_topic" "oncall" {
  name = "stellar-spend-oncall"
  
  tags = {
    Name = "stellar-spend-oncall"
    Environment = var.environment
  }
}

# ============================================
# Alert Deduplication Rule
# ============================================

resource "aws_cloudwatch_metric_alarm" "alert_deduplication" {
  alarm_name = "alert-deduplication"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods = 1
  metric_name = "alerts_triggered"
  namespace = "StellarSpend"
  period = 300
  statistic = "Sum"
  threshold = 100
  alarm_description = "Too many alerts triggered - deduplication needed"
  alarm_actions = [aws_sns_topic.oncall.arn]
}

# ============================================
# Silence Rules (Maintenance Windows)
# ============================================

resource "aws_cloudwatch_metric_alarm" "silence_maintenance" {
  alarm_name = "silence-maintenance"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods = 1
  metric_name = "alerts_triggered"
  namespace = "StellarSpend"
  period = 300
  statistic = "Sum"
  threshold = 1000
  alarm_description = "Maintenance mode - silencing alerts"
  actions_enabled = false
}
