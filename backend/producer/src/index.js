require('dotenv').config();
const pino = require('pino');
const ProducerClient = require('./producerClient');
const createServer = require('./server');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');

const producerClient = new ProducerClient({ brokers: BROKERS, logger });
const config = {
  LOG_TOPIC: process.env.LOG_TOPIC,
  METRICS_TOPIC: process.env.METRICS_TOPIC,
  EVENTS_TOPIC: process.env.EVENTS_TOPIC,
};
const server = createServer({ producerClient, logger, config });

const PORT = parseInt(process.env.PORT || '4000', 10);

async function main() {
  // start HTTP server immediately so orchestration sees the pod/container as up
  await server.listen(PORT);
  logger.info({ port: PORT }, 'HTTP server started (health endpoint available)');

  // try to connect producer with retries/backoff but don't block server start
  const connectRetries = parseInt(process.env.KAFKA_CONNECT_RETRIES || '6', 10);
  const baseDelayMs = parseInt(process.env.KAFKA_CONNECT_BASE_DELAY_MS || '500', 10);
  producerClient.connectWithRetry({ retries: connectRetries, baseDelayMs }).catch((err) => {
    // connectWithRetry emits 'failed' and logs; we catch to prevent unhandled rejections
    logger.error({ err: err && err.message }, 'connectWithRetry rejected');
  });

  // graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutdown requested');
    // stop accepting new requests
    try {
      await server.close();
      logger.info('HTTP server closed');
    } catch (err) {
      logger.warn({ err: err && err.message }, 'Error closing HTTP server');
    }

    // disconnect producer (with timeout)
    try {
      await producerClient.disconnect({ timeoutMs: 10000 });
    } catch (err) {
      logger.warn({ err: err && err.message }, 'Error during producer disconnect');
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // log when producer becomes ready or fails
  producerClient.on('ready', () => logger.info('Producer reported ready; /ready will return 200'));
  producerClient.on('failed', () => logger.error('Producer failed to connect after retries; /ready will return 503'));
}

main().catch((err) => {
  logger.error({ err: err && err.message }, 'Fatal error in main');
  process.exit(1);
});
