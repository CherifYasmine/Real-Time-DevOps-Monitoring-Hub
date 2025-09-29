const express = require('express');
const createMessagesRouter = require('./routes/messages');

function createServer({ producerClient, logger, config = {} } = {}) {
  const app = express();
  app.use(express.json());

  // immediate health endpoint: server up
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  // readiness depends on producer client
  app.get('/ready', (req, res) => {
    if (producerClient && producerClient.ready) return res.status(200).json({ ready: true });
    return res.status(503).json({ ready: false });
  });

  // register message routes (logs/metrics/events + generic produce)
  const messagesRouter = createMessagesRouter({ producerClient, logger, config });
  app.use('/', messagesRouter);

  let server = null;
  return {
    listen(port) {
      return new Promise((resolve) => {
        server = app.listen(port, () => resolve(server));
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        if (!server) return resolve();
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
    _app: app,
  };
}

module.exports = createServer;
