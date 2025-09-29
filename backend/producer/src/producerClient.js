const EventEmitter = require('events');
const { Kafka } = require('kafkajs');

class ProducerClient extends EventEmitter {
  constructor({ brokers = ['localhost:9092'], logger = console } = {}) {
    super();
    this.logger = logger;
    this.brokers = brokers;
    this.kafka = new Kafka({ brokers: this.brokers });
    this.producer = this.kafka.producer();
    this.ready = false;
    this.stopped = false;
  }

  async connectWithRetry({ retries = 5, baseDelayMs = 500, maxDelayMs = 30000 } = {}) {
    let attempt = 0;
    while (!this.stopped) {
      attempt += 1;
      try {
        this.logger.info({ attempt }, 'Attempting Kafka producer.connect()');
        await this.producer.connect();
        this.ready = true;
        this.logger.info({ brokers: this.brokers }, 'Kafka producer connected');
        this.emit('ready');
        return;
      } catch (err) {
        this.logger.warn({ attempt, err: err.message }, 'Kafka connect attempt failed');
        if (attempt >= retries) {
          break;
        }
        const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        this.logger.info({ attempt, delay }, 'Retrying Kafka connect after backoff(ms)');
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // failed after retries
    this.ready = false;
    this.logger.error({ retries }, 'Failed to connect Kafka producer after retries; continuing without readiness');
    this.emit('failed');
  }

  async disconnect({ timeoutMs = 10000 } = {}) {
    this.stopped = true;
    if (!this.producer) return;
    try {
      // race disconnect with a timeout so shutdown never hangs indefinitely
      await Promise.race([
        this.producer.disconnect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('disconnect timeout')), timeoutMs)),
      ]);
      this.logger.info('Kafka producer disconnected');
    } catch (err) {
      this.logger.warn({ err: err.message }, 'Error while disconnecting producer (ignored)');
    } finally {
      this.ready = false;
    }
  }

  async send({ topic, key, value }) {
    if (!this.ready) throw new Error('producer not ready');
    const message = { value: typeof value === 'string' ? value : JSON.stringify(value) };
    if (key) message.key = key;
    return this.producer.send({ topic, messages: [message] });
  }
}

module.exports = ProducerClient;
