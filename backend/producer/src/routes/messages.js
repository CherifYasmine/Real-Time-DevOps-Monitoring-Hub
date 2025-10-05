const express = require('express');

function createMessagesRouter({ producerClient, logger, config } = {}) {
  const router = express.Router();

  const topics = {
    logs: config.LOG_TOPIC || 'rtmh.logs',
    metrics: config.METRICS_TOPIC || 'rtmh.metrics',
    events: config.EVENTS_TOPIC || 'rtmh.events',
  };


  // validator: ensure body has 'value' and 'project'
  function requireValueAndProject(req, res, next) {
    if (!req.body || typeof req.body.value === 'undefined') {
      return res.status(400).json({ error: 'body must include `value`' });
    }
    if (!req.body.project || typeof req.body.project !== 'string' || !req.body.project.trim()) {
      return res.status(400).json({ error: 'body must include non-empty `project` (string)'});
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
      const project = req.body.project;
      // Wrap value with project field for downstream consumers
      const messageValue = typeof value === 'object' ? { ...value, project } : { value, project };
      await producerClient.send({ topic, key, value: messageValue });
      return res.status(202).json({ ok: true });
    } catch (err) {
      logger.error({ err: err && err.message }, 'Failed to send message');
      return res.status(500).json({ error: err.message });
    }
  }

  router.post('/logs', requireValueAndProject, async (req, res) => sendOrFail(req, res, topics.logs));
  router.post('/metrics', requireValueAndProject, async (req, res) => sendOrFail(req, res, topics.metrics));
  router.post('/events', requireValueAndProject, async (req, res) => sendOrFail(req, res, topics.events));


  // Generic produce route: require topic, value, and project
  router.post('/produce', requireValueAndProject, async (req, res) => {
    const { topic } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'topic required' });
    return sendOrFail(req, res, topic);
  });

  return router;
}

module.exports = createMessagesRouter;
