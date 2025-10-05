## Example Flow

1. Producer sends log: `POST /logs {"project": "my_project", "value": {"level": "error", "msg": "API timeout"}}`
2. Processor receives message from `rtmh.logs` topic
3. Stores raw log in `raw_events` table (with project field)
4. Adds to sliding window for error rate calculation
5. If error rate > 5%, creates incident in `incidents` table (with project field)
6. Every 30s, stores aggregated error rate in `metrics_agg` table (with project field)

## Testing

### End-to-End Pipeline Test

1. **Start the infrastructure:**
   ```bash
   # From project root
   docker-compose -f infra/docker-compose.yml up -d
   
   # Apply database migrations
   ./infra/migrate-docker.sh
   ```

2. **Start the producer (Terminal 1):**
   ```bash
   cd backend/producer
   npm start
   ```

3. **Start the processor (Terminal 2):**
   ```bash
   cd backend/processor
   cp .env.example .env  # Edit if needed
   npm start
   ```

4. **Send test messages (Terminal 3):**
   ```bash
   # Send some normal logs
   curl -X POST http://localhost:4000/logs \
     -H "Content-Type: application/json" \
     -d '{
    "project": "my_project",
    "value": {
      "level": "error",
      "msg": "Payment processing failed",
      "service": "payment-service",
      "user_id": "user_123",
      "amount": 99.99,
      "currency": "USD",
      "error_code": "CARD_DECLINED",
      "timestamp": "2025-10-03T10:30:00Z"
    }}'
   
   # Send error logs to trigger incident detection
   for i in {1..15}; do
     curl -X POST http://localhost:4000/logs \
       -H "Content-Type: application/json" \
       -d '{"project":"my_project","value":{"level":"error","msg":"Database connection failed","service":"api"}}'
     sleep 0.5
   done
   
   # Send metrics
   curl -s -X POST http://localhost:4000/metrics -H "Content-Type: application/json" -d '{"project":"my_project","value": {"response_time": 850, "endpoint": "/api/orders", "status_code": 500}}'
   
   # Send events
   curl -X POST http://localhost:4000/events \
     -H "Content-Type: application/json" \
     -d '{"project":"my_project","value":{"type":"deployment","service":"api","version":"v1.2.3"}}'
   ```

5. **Verify processing worked:**
   ```bash
   # Check raw events were stored
   docker exec rtmh_postgres psql -U rtuser -d rt_monitoring \
    -c "SELECT project, topic, data->>'level' as level, data->>'msg' as msg, created_at FROM raw_events ORDER BY created_at DESC LIMIT 5;"

   docker exec rtmh_postgres psql -U rtuser -d rt_monitoring \
    -c "SELECT project, topic, jsonb_pretty(data) as log_data, created_at FROM raw_events ORDER BY created_at DESC LIMIT 5;"
   
   # Check if incident was created (should happen after ~15 error logs)
   docker exec rtmh_postgres psql -U rtuser -d rt_monitoring \
     -c "SELECT title, severity, status, created_at FROM incidents ORDER BY created_at DESC LIMIT 3;"
   
   # Check metrics aggregations (wait 30+ seconds after sending)
   docker exec rtmh_postgres psql -U rtuser -d rt_monitoring \
     -c "SELECT window_key, metric_type, value, count, window_start FROM metrics_agg ORDER BY window_start DESC LIMIT 5;"
   ```

### Expected Results

**After sending logs:**
- Raw events in `raw_events` table with `topic = 'rtmh.logs'`
- After 15+ error logs: An incident created with title like "High Error Rate Detected: X.X%"

**After sending metrics:**
- Raw events in `raw_events` table with `topic = 'rtmh.metrics'`  
- After 30+ seconds: Aggregations may appear in `metrics_agg` table

**Processor logs should show:**
```
{"level":"info","msg":"Real-time processor started"}
{"level":"debug","msg":"Processed log message","level":"error","errorRate":0.XXX}
{"level":"warn","msg":"Created error rate incident","errorRate":0.XXX,"logCount":15}
```
