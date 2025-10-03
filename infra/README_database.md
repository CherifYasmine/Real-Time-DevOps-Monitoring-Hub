# Database Schema & Migrations

This directory contains the database schema and migration scripts for the Real-Time DevOps Monitoring Hub.

## Schema Overview

The database stores:

- **`raw_events`** - All incoming messages from Kafka topics (logs, metrics, events)
- **`metrics_agg`** - Computed aggregations from sliding window analysis  
- **`incidents`** - Detected incidents and their lifecycle status
- **`alert_rules`** - Configuration for alerting rules and thresholds
- **`alert_notifications`** - Tracks notification delivery status

## Running Migrations

### Prerequisites

#### For Docker Method (Recommended)
1. Docker and docker-compose installed
2. PostgreSQL container running: `docker-compose -f infra/docker-compose.yml up -d`

#### For Local psql Method  
1. PostgreSQL client (`psql`) installed locally
2. Database server running (via docker-compose or standalone)
3. Database and user created

### Migration Scripts

Two migration scripts are provided:

- **`migrate-docker.sh`** - Uses `docker exec` to run migrations inside the PostgreSQL container. Best for environments where psql is not installed locally.
- **`migrate.sh`** - Uses local `psql` command with connection string. Requires PostgreSQL client tools installed.

### Quick Start

#### Option 1: Using Docker (Recommended)

If you don't have `psql` installed locally or are using the provided docker-compose setup:

```bash
# Test database connection
./infra/migrate-docker.sh --test

# Check migration status  
./infra/migrate-docker.sh --status

# Apply all pending migrations
./infra/migrate-docker.sh
```

#### Option 2: Using Local psql

If you have PostgreSQL client tools installed:

```bash
# Test database connection
./infra/migrate.sh --test

# Check migration status  
./infra/migrate.sh --status

# Apply all pending migrations
./infra/migrate.sh
```

### Environment Configuration

#### Docker Method (Default)
Uses the running `rtmh_postgres` container from docker-compose. No additional configuration needed if using the standard setup.

Custom container/database names:
```bash
POSTGRES_CONTAINER=my_postgres_container ./infra/migrate-docker.sh
POSTGRES_USER=myuser POSTGRES_DB=mydb ./infra/migrate-docker.sh
```

#### Direct Connection Method
Set the database URL via environment variable:

```bash
export POSTGRES_URL="postgres://rtuser:rtpass@localhost:5432/rt_monitoring"
./infra/migrate.sh
```

### Migration Files

Migrations are applied in alphabetical order:

- `001_initial_schema.sql` - Creates all tables, indexes, and constraints
- `002_sample_data.sql` - Inserts sample alert rules and test data

## Database Setup (Docker Compose)

The included `docker-compose.yml` sets up PostgreSQL with:

- Database: `rt_monitoring`  
- User: `rtuser`
- Password: `rtpass`
- Port: `5432` (exposed as `5432` on host)

## Manual Database Setup

If not using docker-compose:

```sql
-- Connect as superuser and create database
CREATE DATABASE rt_monitoring;
CREATE USER rtuser WITH PASSWORD 'rtpass';
GRANT ALL PRIVILEGES ON DATABASE rt_monitoring TO rtuser;

-- Connect to rt_monitoring database
\c rt_monitoring;
GRANT ALL ON SCHEMA public TO rtuser;
```

Then run migrations:

```bash
# Using Docker method
./infra/migrate-docker.sh

# OR using direct connection  
POSTGRES_URL="postgres://rtuser:rtpass@localhost:5432/rt_monitoring" ./infra/migrate.sh
```

## Examples & Verification

### Run Migrations and Verify

```bash
# 1. Apply migrations
./infra/migrate-docker.sh

# 2. Verify tables were created
docker exec rtmh_postgres psql -U rtuser -d rt_monitoring -c "\dt"

# 3. Check sample data
docker exec rtmh_postgres psql -U rtuser -d rt_monitoring \
  -c "SELECT name, metric_type, threshold FROM alert_rules;"

# 4. Check migration history
./infra/migrate-docker.sh --status
```

### Troubleshooting

**Container not running:**
```bash
# Start the infrastructure
docker-compose -f infra/docker-compose.yml up -d

# Verify postgres is running
docker ps | grep postgres
```

**Permission errors:**
```bash
# Make sure migration scripts are executable
chmod +x infra/migrate-docker.sh infra/migrate.sh
```

**Connection issues:**
```bash
# Test database connection
./infra/migrate-docker.sh --test

# Check container logs
docker logs rtmh_postgres
```

## Schema Details

### raw_events
- Stores all Kafka messages with JSONB data
- Indexed by topic and timestamp
- GIN index on log level for fast log queries

### metrics_agg  
- Stores sliding window aggregations
- Unique constraint on (window_key, metric_type, window_start)
- Automatic updated_at timestamp trigger

### incidents
- UUID primary keys for external API compatibility
- Status workflow: open → investigating → resolved/closed
- Severity levels: low, medium, high, critical
- Metadata stored as JSONB for flexibility

### alert_rules
- Configurable thresholds and conditions
- Support for multiple notification channels
- Can be enabled/disabled without deletion

## Querying Examples

```sql
-- Recent error rate incidents
SELECT title, severity, created_at 
FROM incidents 
WHERE source = 'error_rate_monitor' 
ORDER BY created_at DESC LIMIT 10;

-- Metrics aggregations for last hour
SELECT window_key, metric_type, value, window_start
FROM metrics_agg 
WHERE window_start > NOW() - INTERVAL '1 hour'
ORDER BY window_start DESC;

-- Log events with errors
SELECT data->>'level' as level, data->>'msg' as message, created_at
FROM raw_events 
WHERE topic = 'rtmh.logs' 
  AND data->>'level' IN ('error', 'ERROR')
  AND created_at > NOW() - INTERVAL '10 minutes';
```

## Backup & Recovery

```bash
# Backup
pg_dump "$POSTGRES_URL" > backup.sql

# Restore  
psql "$POSTGRES_URL" < backup.sql
```

## Performance Notes

- Raw events table will grow quickly - consider partitioning by date
- Indexes are optimized for common query patterns
- JSONB columns use GIN indexes for efficient queries
- Consider setting up regular VACUUM and ANALYZE jobs