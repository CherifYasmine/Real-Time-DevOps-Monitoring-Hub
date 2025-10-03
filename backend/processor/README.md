# processor

Real-time processor that consumes messages from Kafka topics and computes sliding window aggregations.

## What it does

- Consumes from `rtmh.logs`, `rtmh.metrics`, `rtmh.events` topics
- Computes real-time aggregations using sliding windows (default: 60s)
- Detects incidents when thresholds are breached (e.g., high error rates)
- Stores raw events and aggregated metrics in Postgres
- Prevents duplicate incident creation with deduplication logic

## Components

- `src/consumerClient.js` - Kafka consumer wrapper with topic-specific handlers
- `src/slidingWindow.js` - Sliding window aggregator for time-based metrics
- `src/databaseClient.js` - Postgres client for storing events, aggregations, and incidents
- `src/processor.js` - Main processor class that ties everything together
- `src/index.js` - Entry point with graceful shutdown

## Setup

1. Copy `.env.example` to `.env` and configure:
   ```bash
   KAFKA_BROKERS=localhost:29092
   POSTGRES_URL=postgres://rtuser:rtpass@localhost:5432/rt_monitoring
   WINDOW_SIZE_MS=60000
   ERROR_RATE_THRESHOLD=0.05
   ```

2. Install dependencies:
   ```bash
   npm ci
   ```

3. Ensure database schema exists (see `../infra/` for schema setup)

4. Start the processor:
   ```bash
   npm start
   ```

## Processing Logic

### Logs (rtmh.logs)
- Stores each log message in `raw_events` table
- Tracks error rate in sliding window
- Creates incidents when error rate > threshold (default: 5%)
- Requires minimum 10 logs in window to avoid false positives

### Metrics (rtmh.metrics) 
- Stores raw metrics in `raw_events` table
- Maintains sliding windows for each numeric metric
- Stores periodic aggregations in `metrics_agg` table

### Events (rtmh.events)
- Stores raw events in `raw_events` table  
- Tracks event frequency in sliding window
- Can be extended for deployment tracking, service state changes

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated Kafka broker addresses |
| `POSTGRES_URL` | - | Postgres connection string |
| `WINDOW_SIZE_MS` | `60000` | Sliding window size in milliseconds |
| `ERROR_RATE_THRESHOLD` | `0.05` | Error rate threshold (0.05 = 5%) |
| `LOG_LEVEL` | `info` | Pino log level |

## Database Schema Required

The processor expects these tables:
- `raw_events` - stores all incoming messages
- `metrics_agg` - stores computed aggregations  
- `incidents` - stores detected incidents/alerts

See the database migration scripts for schema details.

## Troubleshooting Tests

**No messages processed:**
- Check Kafka connection: processor logs should show "Kafka consumer connected"
- Verify topics exist: `docker exec rtmh_kafka kafka-topics --list --bootstrap-server localhost:9092`
- Check producer is sending to correct broker (localhost:29092 for host)

**No database writes:**
- Check database connection: processor logs should show "Database connection verified"
- Test manually: `docker exec rtmh_postgres psql -U rtuser -d rt_monitoring -c "SELECT 1;"`
- Verify schema exists: `./infra/migrate-docker.sh --status`

**No incidents created:**
- Need minimum 10 logs in window with error rate > 5%
- Check error rate calculation in processor logs
- Verify alert rules: `docker exec rtmh_postgres psql -U rtuser -d rt_monitoring -c "SELECT * FROM alert_rules;"`

## Monitoring

The processor logs key metrics and events:
- Connection status to Kafka and Postgres
- Processing rates and error rates
- Incident creation events
- Window cleanup operations

Use structured logs with correlation IDs for troubleshooting.