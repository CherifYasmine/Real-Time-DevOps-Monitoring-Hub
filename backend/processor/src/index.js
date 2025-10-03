require('dotenv').config();
const pino = require('pino');
const RealTimeProcessor = require('./processor');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const processor = new RealTimeProcessor({
  kafkaBrokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
  postgresUrl: process.env.POSTGRES_URL,
  windowSizeMs: parseInt(process.env.WINDOW_SIZE_MS || '60000', 10),
  errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD || '0.05'),
  logger
});

async function main() {
  try {
    await processor.start();
    
    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info({ signal }, 'Shutdown requested');
      await processor.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start processor');
    process.exit(1);
  }
}

main();