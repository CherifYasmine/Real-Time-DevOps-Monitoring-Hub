-- Sample data for testing and development

-- Insert some sample alert rules
INSERT INTO alert_rules (name, description, metric_type, condition, threshold, notification_channels) VALUES
('High Error Rate', 'Alert when error rate exceeds 5%', 'error_rate', '>', 0.05, '["slack", "email"]'),
('Low Event Activity', 'Alert when event count drops below 10 per minute', 'event_count', '<', 10, '["slack"]'),
('High CPU Usage', 'Alert when average CPU exceeds 80%', 'cpu_avg', '>', 0.8, '["email"]');

-- Insert a sample resolved incident for testing
INSERT INTO incidents (title, description, severity, status, source, resolved_at) VALUES
('Test Incident - Resolved', 'Sample incident for testing dashboard', 'medium', 'resolved', 'test_source', NOW() - INTERVAL '1 hour');

-- Comments
COMMENT ON TABLE alert_rules IS 'These are default alerting rules - can be modified via admin interface';
COMMENT ON TABLE incidents IS 'Sample incident shows resolved state with resolved_at timestamp';