// quick test script to send one message to rtmh.logs
require('dotenv').config();
const { Kafka } = require('kafkajs');

(async function() {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  const kafka = new Kafka({ brokers });
  const producer = kafka.producer();
  await producer.connect();
  console.log('connected to', brokers);
  await producer.send({ topic: 'rtmh.logs', messages: [{ value: JSON.stringify({ time: Date.now(), msg: 'test' }) }] });
  console.log('message sent');
  await producer.disconnect();
})();
