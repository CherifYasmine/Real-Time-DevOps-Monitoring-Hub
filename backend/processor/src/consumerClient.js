const EventEmitter = require('events');
const { Kafka } = require('kafkajs');

class ConsumerClient extends EventEmitter {
  constructor({ 
    brokers = ['localhost:9092'], 
    groupId = 'rtmh-processor', 
    logger = console 
  } = {}) {
    super();
    this.logger = logger;
    this.brokers = brokers;
    this.groupId = groupId;
    this.kafka = new Kafka({ brokers: this.brokers });
    this.consumer = this.kafka.consumer({ groupId: this.groupId });
    this.connected = false;
    this.stopped = false;
    this.messageHandlers = new Map();
  }

  // Register a handler for messages from a specific topic
  onTopic(topic, handler) {
    this.messageHandlers.set(topic, handler);
  }

  async connect() {
    try {
      await this.consumer.connect();
      this.connected = true;
      this.logger.info({ brokers: this.brokers, groupId: this.groupId }, 'Kafka consumer connected');
      this.emit('connected');
    } catch (err) {
      this.logger.error({ err: err.message }, 'Failed to connect consumer');
      throw err;
    }
  }

  async subscribe(topics) {
    if (!Array.isArray(topics)) topics = [topics];
    
    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.logger.info({ topic }, 'Subscribed to topic');
    }
  }

  async start() {
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        try {
          // Parse message
          const value = JSON.parse(message.value.toString());
          const key = message.key?.toString();
          
          const messageData = {
            topic,
            partition,
            offset: message.offset,
            key,
            value,
            timestamp: message.timestamp
          };

          // Call registered handler for this topic
          const handler = this.messageHandlers.get(topic);
          if (handler) {
            await handler(messageData);
          } else {
            this.logger.debug({ topic, key }, 'No handler registered for topic');
          }

          // Periodic heartbeat for long-running processing
          await heartbeat();
        } catch (err) {
          this.logger.error({ 
            topic, 
            partition, 
            offset: message.offset, 
            err: err.message 
          }, 'Error processing message');
          // Don't throw - would stop the consumer
        }
      },
    });
  }

  async disconnect() {
    this.stopped = true;
    if (this.consumer && this.connected) {
      try {
        await this.consumer.disconnect();
        this.connected = false;
        this.logger.info('Kafka consumer disconnected');
      } catch (err) {
        this.logger.warn({ err: err.message }, 'Error disconnecting consumer');
      }
    }
  }
}

module.exports = ConsumerClient;