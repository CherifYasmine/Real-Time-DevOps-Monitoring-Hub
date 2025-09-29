process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
const ProducerClient = require('../src/producerClient');

describe('ProducerClient', () => {
  test('emits ready when connect succeeds', async () => {
    // create instance and replace internal producer with a fake
    const client = new ProducerClient({ brokers: ['x'], logger: console });
    // stub producer.connect
    client.producer = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
    };

    const readyPromise = new Promise((resolve) => client.once('ready', resolve));
    await client.connectWithRetry({ retries: 1, baseDelayMs: 1 });
    await expect(readyPromise).resolves.toBeUndefined();
    expect(client.ready).toBe(true);
    // send should call underlying producer.send
    await expect(client.send({ topic: 't', value: { a: 1 } })).resolves.toBeUndefined();
    expect(client.producer.send).toHaveBeenCalled();
    await client.disconnect({ timeoutMs: 10 });
    expect(client.ready).toBe(false);
  });

  test('emits failed when connect fails after retries', async () => {
    const client = new ProducerClient({ brokers: ['x'], logger: console });
    client.producer = {
      connect: jest.fn().mockRejectedValue(new Error('failed connect')),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const failedPromise = new Promise((resolve) => client.once('failed', resolve));
    await client.connectWithRetry({ retries: 2, baseDelayMs: 1 });
    await expect(failedPromise).resolves.toBeUndefined();
    expect(client.ready).toBe(false);
  });
});
