# Grafana Dashboard Setup

This directory contains the **single provisioned Grafana dashboard** and Postgres datasource for the Real-Time DevOps Monitoring Hub.

## Quick Start

1. **Start the stack:**
   ```bash
   cd /home/yasmine/PersonalProjects/Real-Time-DevOps-Monitoring-Hub/infra
   docker-compose up -d
   ```

2. **Access Grafana:**
   - URL: http://localhost:3000
   - Username: `admin`
   - Password: `admin`

3. **Dashboard auto-provisioned:**
  - Dashboard: `RT Monitoring - Logs, Metrics & Events`
  - Datasource: `rt_monitoring` (Postgres)

> If you don't see the dashboard, refresh the browser after ~5s or check the Grafana logs.

## What's Included

### Datasource
- **Name:** rt_monitoring
- **Type:** PostgreSQL
- **Connection:** Automatically connects to the Postgres container
- **Database:** rt_monitoring
- **User:** rtuser (password: rtpass)

### Dashboard Panels (Current)

1. Total Logs Count (stat)
2. Total Metrics Count (stat)
3. Total Events Count (stat)
4. Log Levels Breakdown (table)
5. Recent Logs (table, last 20)
6. Recent Metrics (table, last 20)
7. Recent Events (table, last 20)
8. All Topics Overview (counts + first/last event timestamps)
9. Logs Explorer (time-range aware, fixed max 500)

### Key Features
- **Auto-refresh:** Dashboard refreshes every 30 seconds
- **Time range:** Default 6-hour window
- **Color coding:** Log levels and incident severity are color-coded
- **Real-time:** Shows live data from the monitoring pipeline
 - **Row limit variable:** Change how many recent rows appear (default 50) via variable `limit`
 - **Explorer panel:** Dedicated larger (500 row) log explorer honoring the global time picker

## Sending Test Data

1. **Generate some test data:**
   ```bash
   # Send some logs
   # Logs (producer runs on port 4000)
   curl -X POST http://localhost:4000/logs \
     -H "Content-Type: application/json" \
     -d '{"value": {"level": "error", "msg": "Database connection failed", "service": "api", "host": "srv-01"}}'

   curl -X POST http://localhost:4000/logs \
     -H "Content-Type: application/json" \
     -d '{"value": {"level": "info", "msg": "User login success", "service": "auth", "host": "srv-02"}}'

   # Metrics
   curl -X POST http://localhost:4000/metrics \
     -H "Content-Type: application/json" \
     -d '{"value": {"response_time": 180, "endpoint": "/api/users", "status_code": 200}}'

   curl -X POST http://localhost:4000/metrics \
     -H "Content-Type: application/json" \
     -d '{"value": {"response_time": 950, "endpoint": "/api/orders", "status_code": 500}}'
   ```

2. **Wait a few moments** for the processor to consume and aggregate the data

3. **Check Grafana dashboard** – You should see counts update and new rows in Recent Logs / Metrics / Events.

## Dashboard Customization

### Adding New Panels
The dashboard exposes a **template variable** named `limit` (default: 50) used by the Recent Logs / Metrics / Events tables. To change it:
1. Open the dashboard.
2. Click the variable dropdown (top-left) labeled `Row Limit`.
3. Enter a new number (e.g. 100, 200) and hit Enter — tables refresh automatically.
1. Click "Add Panel" in the dashboard
The Logs Explorer panel is separate and always caps at 500 rows to avoid excessive payload size.
2. Select "rt_monitoring" as the datasource
3. Write SQL queries against these tables:
  - `raw_events` – All incoming logs / metrics / events (topic field differentiates)
  - `metrics_agg` – Aggregated windows (if processor populates)
  - `incidents` – Detected incidents
  - `alert_rules` – Alert rule definitions

### Useful Queries

**Recent errors by service (logs):**
```sql
SELECT 
  data->>'service' AS service,
  COUNT(*) AS error_count
FROM raw_events
WHERE topic = 'rtmh.logs'
  AND data->>'level' = 'error'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY data->>'service'
ORDER BY error_count DESC;
```

**Response time percentiles (metrics):**
```sql
SELECT
  time_bucket('5 minutes', created_at) AS bucket,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY (data->>'response_time')::numeric) AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY (data->>'response_time')::numeric) AS p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY (data->>'response_time')::numeric) AS p99
FROM raw_events
WHERE topic = 'rtmh.metrics'
  AND data->>'response_time' IS NOT NULL
  AND created_at BETWEEN $__timeFrom() AND $__timeTo()
GROUP BY bucket
ORDER BY bucket;
```

**Service health overview (metrics):**
```sql
SELECT 
  data->>'service' as service,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE (data->>'status_code')::int >= 400) as error_count,
  (COUNT(*) FILTER (WHERE (data->>'status_code')::int >= 400) * 100.0 / COUNT(*)) as error_rate,
  AVG((data->>'response_time')::numeric) as avg_response_time
FROM raw_events
WHERE topic = 'rtmh.metrics'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY data->>'service'
ORDER BY error_rate DESC;
```

## Troubleshooting

### Dashboard not appearing
1. Check Grafana logs: `docker logs rtmh_grafana`
2. Verify provisioning directory is mounted: `docker exec rtmh_grafana ls -la /etc/grafana/provisioning/`
3. Check if datasource is working: Go to Configuration > Data Sources in Grafana UI

### No data in panels
1. Verify the processor is running: `docker logs rtmh_processor`
2. Check if data exists in database:
   ```bash
   docker exec -it rtmh_postgres psql -U rtuser -d rt_monitoring -c "SELECT COUNT(*) FROM raw_events;"
   ```
3. Send test data using the curl commands above

### Connection issues
1. Make sure all containers are up: `docker-compose ps`
2. Check container networking: `docker network ls` and `docker network inspect infra_default`
3. Verify Postgres is accessible from Grafana: `docker exec rtmh_grafana nc -zv rtmh_postgres 5432`

## File Structure
```
grafana/
├── provisioning/
│   ├── datasources/
│   │   └── postgres.yml          # Auto-configures Postgres datasource
│   └── dashboards/
│       ├── dashboard-provider.yml       # Dashboard discovery configuration
│       └── rt-working-test.json         # Single active dashboard
└── README_grafana.md             # This file
```