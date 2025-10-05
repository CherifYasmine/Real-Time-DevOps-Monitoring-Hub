# backend/producer

Node + Express producer that publishes messages to Kafka using KafkaJS.

This service is intentionally small and designed for local development and CI smoke tests.

Contents
- `src/producerClient.js` - Kafka producer wrapper (connect retry/backoff, send, disconnect)
- `src/server.js` - Express server with `/health`, `/ready`, and message routes
- `src/routes/messages.js` - modular routes: `POST /logs`, `/metrics`, `/events`, and generic `/produce`
- `src/index.js` - orchestrator: starts HTTP server immediately and connects the producer in the background
- `test/` - unit tests (Jest + Supertest)

Quickstart (local)

1. Copy `.env.example` to `.env` and adjust values if needed. Important envs:
   - `KAFKA_BROKERS` (comma-separated brokers). For host-based dev with the provided docker-compose use `localhost:29092`.
   - `PORT` (default: 4000)
   - Optional topic overrides: `LOG_TOPIC`, `METRICS_TOPIC`, `EVENTS_TOPIC`

2. Install dependencies:

```bash
npm ci
```

3. Start the producer (starts HTTP server immediately; producer will connect in background):

```bash
npm start
```

4. Health & readiness

- `GET /health` → 200 when server process is up (use for liveness).
- `GET /ready` → 200 only when the Kafka producer has successfully connected; 503 otherwise (use for readiness).

Message endpoints

- `POST /logs` → publishes to `LOG_TOPIC` (default: `rtmh.logs`).
- `POST /metrics` → publishes to `METRICS_TOPIC` (default: `rtmh.metrics`).
- `POST /events` → publishes to `EVENTS_TOPIC` (default: `rtmh.events`).
- `POST /produce` → generic: expects `{ topic, value, key? }`.

All message endpoints now require a top-level `project` field (string) in addition to the `value` field. Example body:

```json
{
  "project": "my_project",
  "value": { "msg": "hello", "time": 123 }
}
```

Responses
- `202` — accepted (message sent)
- `503` — producer not ready (the server is up but Kafka not connected)
- `400` — bad request (missing `value` or topic)
- `500` — internal error while sending

Examples

Post a log (dedicated route):

```bash
curl -X POST http://localhost:4000/logs \
  -H "Content-Type: application/json" \
  -d '{"project":"my_project","value":{"level":"info","msg":"hello"}}' -i
```

Fallback generic produce:

```bash
curl -X POST http://localhost:4000/produce \
  -H "Content-Type: application/json" \
  -d '{"topic":"rtmh.logs","project":"my_project","value":{"msg":"via produce"}}' -i
```

Verify delivery with Kafka console consumer (inside Kafka container):

```bash
docker exec -it rtmh_kafka bash -lc \
  "kafka-console-consumer --bootstrap-server localhost:9092 --topic rtmh.logs --from-beginning --max-messages 1"
```

Testing

- Unit tests (Jest + Supertest) are available in `test/` and run with:

```bash
cd backend/producer
npx jest --runInBand
```

Design notes


- All message endpoints require a `project` field for project-based data isolation. This field is included in all Kafka messages and stored in the database for filtering and multi-project support.
- Expose `/metrics` (Prometheus) and graceful request draining.
- Add a Dockerfile and k8s probe manifests.