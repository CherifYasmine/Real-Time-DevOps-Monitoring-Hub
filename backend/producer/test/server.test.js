const request = require('supertest');
const createServer = require('../src/server');

describe('Server routes', () => {
  let serverInstance;
  let fakeProducer;

  beforeEach(async () => {
    fakeProducer = {
      ready: false,
      send: jest.fn().mockResolvedValue(undefined),
    };
    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const app = createServer({ producerClient: fakeProducer, logger, config: {} });
    serverInstance = await app.listen(0); // random port
  });

  afterEach(async () => {
    if (serverInstance && serverInstance.listening) {
      await new Promise((r) => serverInstance.close(r));
    }
  });

  test('/health returns 200', async () => {
    const res = await request(serverInstance).get('/health');
    expect(res.status).toBe(200);
  });

  test('/ready returns 503 when producer not ready and 200 when ready', async () => {
    let res = await request(serverInstance).get('/ready');
    expect(res.status).toBe(503);
    // flip ready
    fakeProducer.ready = true;
    res = await request(serverInstance).get('/ready');
    expect(res.status).toBe(200);
  });

  test('/logs returns 503 when not ready and 202 when ready', async () => {
    const payload = { value: { msg: 'x' } };
    let res = await request(serverInstance).post('/logs').send(payload);
    expect(res.status).toBe(503);
    // flip ready and try again
    fakeProducer.ready = true;
    res = await request(serverInstance).post('/logs').send(payload);
    expect(res.status).toBe(202);
  });

  test('/produce requires topic', async () => {
    fakeProducer.ready = true;
    const res = await request(serverInstance).post('/produce').send({ value: { x: 1 } });
    expect(res.status).toBe(400);
  });
});
