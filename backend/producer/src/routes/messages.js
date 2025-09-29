const express = require('express');

function createMessagesRouter({ producerClient, logger, config } = {}) {
  const router = express.Router();

  const topics = {
    logs: config.LOG_TOPIC || 'rtmh.logs',
    metrics: config.METRICS_TOPIC || 'rtmh.metrics',
    events: config.EVENTS_TOPIC || 'rtmh.events',
  };

  // lightweight validator: ensure body has 'value'
  function requireValue(req, res, next) {
    if (!req.body || typeof req.body.value === 'undefined') {
      return res.status(400).json({ error: 'body must include `value`' });
    }
    return next();
  }

  async function sendOrFail(req, res, topic) {
    if (!producerClient || !producerClient.ready) {
      return res.status(503).json({ error: 'producer not ready' });
    }
    try {
      const key = req.body.key;
      const value = req.body.value;
      await producerClient.send({ topic, key, value });
      return res.status(202).json({ ok: true });
    } catch (err) {
      logger.error({ err: err && err.message }, 'Failed to send message');
      return res.status(500).json({ error: err.message });
    }
  }

  router.post('/logs', requireValue, async (req, res) => sendOrFail(req, res, topics.logs));
  router.post('/metrics', requireValue, async (req, res) => sendOrFail(req, res, topics.metrics));
  router.post('/events', requireValue, async (req, res) => sendOrFail(req, res, topics.events));

  // Keep generic produce route as fallback
  router.post('/produce', async (req, res) => {
    const { topic } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'topic required' });
    return sendOrFail(req, res, topic);
  });

  return router;
}

module.exports = createMessagesRouter;
