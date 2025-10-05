const { Pool } = require('pg');

class DatabaseClient {
  constructor({ connectionString, logger = console } = {}) {
    this.logger = logger;
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      this.logger.error({ err: err.message }, 'Postgres pool error');
    });
  }

  async connect() {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.logger.info('Database connection verified');
    } catch (err) {
      this.logger.error({ err: err.message }, 'Database connection failed');
      throw err;
    }
  }

  // Store raw event (logs, metrics, events)
  async storeRawEvent({ topic, project, data, timestamp = new Date() }) {
    const query = `
      INSERT INTO raw_events (topic, project, data, created_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;
    try {
      const result = await this.pool.query(query, [topic, project, JSON.stringify(data), timestamp]);
      return result.rows[0]?.id;
    } catch (err) {
      this.logger.error({ err: err.message, topic, project }, 'Failed to store raw event');
      throw err;
    }
  }

  // Store aggregated metrics
  async storeMetricsAggregation({ 
    project,
    windowKey, 
    metricType, 
    value, 
    count, 
    windowStart, 
    windowEnd,
    metadata = {}
  }) {
    const query = `
      INSERT INTO metrics_agg (project, window_key, metric_type, value, count, window_start, window_end, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (project, window_key, metric_type, window_start) 
      DO UPDATE SET value = EXCLUDED.value, count = EXCLUDED.count, metadata = EXCLUDED.metadata, updated_at = NOW()
      RETURNING id
    `;
    try {
      const result = await this.pool.query(query, [
        project,
        windowKey, 
        metricType, 
        value, 
        count, 
        windowStart, 
        windowEnd, 
        JSON.stringify(metadata)
      ]);
      return result.rows[0]?.id;
    } catch (err) {
      this.logger.error({ err: err.message, project, windowKey, metricType }, 'Failed to store metrics aggregation');
      throw err;
    }
  }

  // Create incident when thresholds are breached
  async createIncident({ 
    project,
    title, 
    description, 
    severity = 'medium', 
    source, 
    metadata = {},
    status = 'open'
  }) {
    const query = `
      INSERT INTO incidents (project, title, description, severity, source, metadata, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `;
    try {
      const result = await this.pool.query(query, [
        project,
        title, 
        description, 
        severity, 
        source, 
        JSON.stringify(metadata),
        status
      ]);
      return result.rows[0]?.id;
    } catch (err) {
      this.logger.error({ err: err.message, project, title }, 'Failed to create incident');
      throw err;
    }
  }

  // Check if similar incident exists recently
  async findRecentIncident({ source, title, hoursBack = 1 }) {
    const query = `
      SELECT id, title, created_at 
      FROM incidents 
      WHERE source = $1 AND title = $2 AND status != 'resolved'
        AND created_at > NOW() - INTERVAL '${hoursBack} hours'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    try {
      const result = await this.pool.query(query, [source, title]);
      return result.rows[0] || null;
    } catch (err) {
      this.logger.error({ err: err.message, source, title }, 'Failed to find recent incident');
      return null;
    }
  }

  async disconnect() {
    try {
      await this.pool.end();
      this.logger.info('Database pool closed');
    } catch (err) {
      this.logger.warn({ err: err.message }, 'Error closing database pool');
    }
  }
}

module.exports = DatabaseClient;