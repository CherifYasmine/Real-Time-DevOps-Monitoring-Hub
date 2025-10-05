-- Migration: 001_initial_schema.sql
-- Creates the initial database schema for Real-Time DevOps Monitoring Hub

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Raw events table - stores all incoming messages from Kafka topics
CREATE TABLE raw_events (
    id BIGSERIAL PRIMARY KEY,
    topic VARCHAR(255) NOT NULL,
    project VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for efficient queries
    CONSTRAINT raw_events_topic_check CHECK (topic IN ('rtmh.logs', 'rtmh.metrics', 'rtmh.events'))
);

-- Create indexes on raw_events
CREATE INDEX idx_raw_events_topic ON raw_events(topic);
CREATE INDEX idx_raw_events_project ON raw_events(project);
CREATE INDEX idx_raw_events_created_at ON raw_events(created_at);
CREATE INDEX idx_raw_events_data_level ON raw_events ((data->>'level')) WHERE topic = 'rtmh.logs';

-- Metrics aggregations table - stores computed sliding window metrics  
CREATE TABLE metrics_agg (
    id BIGSERIAL PRIMARY KEY,
    project VARCHAR(100) NOT NULL,
    window_key VARCHAR(255) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique metrics per window
    UNIQUE (project, window_key, metric_type, window_start)
);

-- Create indexes on metrics_agg
CREATE INDEX idx_metrics_agg_project ON metrics_agg(project);
CREATE INDEX idx_metrics_agg_window_key ON metrics_agg(window_key);
CREATE INDEX idx_metrics_agg_metric_type ON metrics_agg(metric_type);
CREATE INDEX idx_metrics_agg_window_start ON metrics_agg(window_start);
CREATE INDEX idx_metrics_agg_created_at ON metrics_agg(created_at);

-- Incidents table - stores detected issues and alerts
CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
    source VARCHAR(100) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE NULL
);

-- Create indexes on incidents
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_severity ON incidents(severity);
CREATE INDEX idx_incidents_source ON incidents(source);
CREATE INDEX idx_incidents_project ON incidents(project);
CREATE INDEX idx_incidents_created_at ON incidents(created_at);

-- Alerts table - for future alerting rules configuration
CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    metric_type VARCHAR(100) NOT NULL,
    condition VARCHAR(50) NOT NULL CHECK (condition IN ('>', '<', '>=', '<=', '=', '!=')),
    threshold DOUBLE PRECISION NOT NULL,
    window_duration_ms INTEGER DEFAULT 60000,
    enabled BOOLEAN DEFAULT true,
    notification_channels JSONB DEFAULT '[]', -- ['slack', 'email']
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on alert_rules
CREATE INDEX idx_alert_rules_metric_type ON alert_rules(metric_type);
CREATE INDEX idx_alert_rules_enabled ON alert_rules(enabled);

-- Alert notifications table - tracks sent notifications
CREATE TABLE alert_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    alert_rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL, -- 'slack', 'email', etc.
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    message TEXT,
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes on alert_notifications
CREATE INDEX idx_alert_notifications_incident_id ON alert_notifications(incident_id);
CREATE INDEX idx_alert_notifications_status ON alert_notifications(status);
CREATE INDEX idx_alert_notifications_created_at ON alert_notifications(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_metrics_agg_updated_at BEFORE UPDATE ON metrics_agg FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE raw_events IS 'Stores all raw messages from Kafka topics (logs, metrics, events)';
COMMENT ON TABLE metrics_agg IS 'Stores computed aggregations from sliding window analysis';
COMMENT ON TABLE incidents IS 'Stores detected incidents and their lifecycle status';
COMMENT ON TABLE alert_rules IS 'Configuration for alerting rules and thresholds';
COMMENT ON TABLE alert_notifications IS 'Tracks notification delivery status';