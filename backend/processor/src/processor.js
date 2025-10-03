require('dotenv').config();
const pino = require('pino');
const ConsumerClient = require('./consumerClient');
const SlidingWindowAggregator = require('./slidingWindow');
const DatabaseClient = require('./databaseClient');

class RealTimeProcessor {
  constructor({
    kafkaBrokers = ['localhost:29092'],
    postgresUrl,
    windowSizeMs = 60000,
    errorRateThreshold = 0.05,
    logger = console
  } = {}) {
    this.logger = logger;
    this.windowSizeMs = windowSizeMs;
    this.errorRateThreshold = errorRateThreshold;
    
    // Initialize clients
    this.consumer = new ConsumerClient({ 
      brokers: kafkaBrokers, 
      groupId: 'rtmh-processor',
      logger: this.logger 
    });
    
    this.aggregator = new SlidingWindowAggregator({ 
      windowSizeMs: this.windowSizeMs,
      logger: this.logger 
    });
    
    this.db = new DatabaseClient({ 
      connectionString: postgresUrl,
      logger: this.logger 
    });

    // Setup message handlers
    this.setupHandlers();
    
    // Periodic tasks
    this.setupPeriodicTasks();
  }

  setupHandlers() {
    // Handle log messages
    this.consumer.onTopic('rtmh.logs', async (message) => {
      await this.processLogMessage(message);
    });

    // Handle metrics
    this.consumer.onTopic('rtmh.metrics', async (message) => {
      await this.processMetricsMessage(message);
    });

    // Handle events
    this.consumer.onTopic('rtmh.events', async (message) => {
      await this.processEventMessage(message);
    });
  }

  async processLogMessage(message) {
    const { value, timestamp } = message;
    
    try {
      // Store raw log
      await this.db.storeRawEvent({
        topic: 'rtmh.logs',
        data: value,
        timestamp: new Date(parseInt(timestamp))
      });

      // Add to sliding window for error rate calculation
      this.aggregator.addDataPoint('logs_error_rate', {
        level: value.level,
        timestamp: parseInt(timestamp)
      });

      // Check error rate periodically
      const errorRate = this.aggregator.calculateErrorRate('logs_error_rate');
      const logCount = this.aggregator.calculateCount('logs_error_rate');

      // Create incident if error rate is too high (with minimum sample size)
      if (errorRate > this.errorRateThreshold && logCount >= 10) {
        await this.handleErrorRateIncident(errorRate, logCount);
      }

      this.logger.debug({ 
        level: value.level, 
        errorRate: errorRate.toFixed(3), 
        count: logCount 
      }, 'Processed log message');

    } catch (err) {
      this.logger.error({ err: err.message, message }, 'Error processing log message');
    }
  }

  async processMetricsMessage(message) {
    const { value, timestamp } = message;
    
    try {
      // Store raw metrics
      await this.db.storeRawEvent({
        topic: 'rtmh.metrics',
        data: value,
        timestamp: new Date(parseInt(timestamp))
      });

      // Add to sliding windows for different metric types
      Object.keys(value).forEach(metricName => {
        if (typeof value[metricName] === 'number') {
          this.aggregator.addDataPoint(`metrics_${metricName}`, {
            [metricName]: value[metricName],
            timestamp: parseInt(timestamp)
          });
        }
      });

      this.logger.debug({ metrics: Object.keys(value) }, 'Processed metrics message');

    } catch (err) {
      this.logger.error({ err: err.message, message }, 'Error processing metrics message');
    }
  }

  async processEventMessage(message) {
    const { value, timestamp } = message;
    
    try {
      // Store raw event
      await this.db.storeRawEvent({
        topic: 'rtmh.events',
        data: value,
        timestamp: new Date(parseInt(timestamp))
      });

      // Add to sliding window for event frequency
      this.aggregator.addDataPoint('events_frequency', {
        type: value.type,
        timestamp: parseInt(timestamp)
      });

      this.logger.debug({ type: value.type }, 'Processed event message');

    } catch (err) {
      this.logger.error({ err: err.message, message }, 'Error processing event message');
    }
  }

  async handleErrorRateIncident(errorRate, logCount) {
    const title = `High Error Rate Detected: ${(errorRate * 100).toFixed(1)}%`;
    
    // Check for recent similar incident to avoid spam
    const recentIncident = await this.db.findRecentIncident({
      source: 'error_rate_monitor',
      title: 'High Error Rate Detected',
      hoursBack: 1
    });

    if (!recentIncident) {
      await this.db.createIncident({
        title,
        description: `Error rate of ${(errorRate * 100).toFixed(2)}% detected over ${logCount} log messages in the last ${this.windowSizeMs / 1000}s`,
        severity: errorRate > this.errorRateThreshold * 2 ? 'high' : 'medium',
        source: 'error_rate_monitor',
        metadata: {
          errorRate,
          logCount,
          threshold: this.errorRateThreshold,
          windowSizeMs: this.windowSizeMs
        }
      });

      this.logger.warn({ errorRate, logCount, threshold: this.errorRateThreshold }, 'Created error rate incident');
    }
  }

  setupPeriodicTasks() {
    // Store aggregations every 30 seconds
    this.aggregationInterval = setInterval(async () => {
      await this.storeAggregations();
    }, 30000);

    // Cleanup old windows every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.aggregator.cleanupWindows();
    }, 300000);
  }

  async storeAggregations() {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.windowSizeMs);

      // Store log error rate
      const errorRate = this.aggregator.calculateErrorRate('logs_error_rate');
      const logCount = this.aggregator.calculateCount('logs_error_rate');
      
      if (logCount > 0) {
        await this.db.storeMetricsAggregation({
          windowKey: 'logs_error_rate',
          metricType: 'error_rate',
          value: errorRate,
          count: logCount,
          windowStart,
          windowEnd: now
        });
      }

      // Store event frequency
      const eventCount = this.aggregator.calculateCount('events_frequency');
      if (eventCount > 0) {
        await this.db.storeMetricsAggregation({
          windowKey: 'events_frequency',
          metricType: 'event_count',
          value: eventCount,
          count: eventCount,
          windowStart,
          windowEnd: now
        });
      }

      this.logger.debug({ errorRate, logCount, eventCount }, 'Stored aggregations');

    } catch (err) {
      this.logger.error({ err: err.message }, 'Error storing aggregations');
    }
  }

  async start() {
    try {
      // Connect to database
      await this.db.connect();
      
      // Connect consumer and subscribe to topics
      await this.consumer.connect();
      await this.consumer.subscribe(['rtmh.logs', 'rtmh.metrics', 'rtmh.events']);
      
      // Start consuming
      await this.consumer.start();
      
      this.logger.info('Real-time processor started');
    } catch (err) {
      this.logger.error({ err: err.message }, 'Failed to start processor');
      throw err;
    }
  }

  async stop() {
    this.logger.info('Stopping processor...');
    
    // Clear intervals
    if (this.aggregationInterval) clearInterval(this.aggregationInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    
    // Disconnect clients
    await this.consumer.disconnect();
    await this.db.disconnect();
    
    this.logger.info('Processor stopped');
  }
}

module.exports = RealTimeProcessor;