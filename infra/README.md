## Infra quickstart (local dev)

This folder contains the local development infra for the Real-Time DevOps Monitoring Hub.

What you'll find:
- `docker-compose.yml` — annotated compose that brings up Zookeeper, Kafka, Postgres and Grafana.

Why this exists:
- Kafka requires Zookeeper (for this dev setup) and Postgres/Grafana let us run the pipeline end-to-end locally.
- Keeping infra in `infra/` keeps development dependencies separate from application code.

Step-by-step (how to run locally):

1) Inspect the compose file
   - Read `docker-compose.yml` to see ports, credentials and service names. The file contains comments explaining each service and healthchecks.

2) Start the stack

   ```bash
   # from project root
   docker-compose -f infra/docker-compose.yml up -d
   ```
   and to stop it run
   ```bash
   # from project root
   docker-compose -f infra/docker-compose.yml stop
   ```

3) Verify services
   - Zookeeper: TCP port 2181 reachable
   - Kafka: port 9092 reachable (use kafkacat or KafkaJS consumer to test)
   - Postgres: port 5432 reachable (user: `rtuser`, db: `rt_monitoring`, password: `rtpass`)
   - Grafana: open http://localhost:3000 (admin/admin)

4) Next steps (after stack is up)
   - Scaffold `backend/producer` and configure it to use: `KAFKA_BROKERS=localhost:9092` and `POSTGRES_URL=postgres://rtuser:rtpass@localhost:5432/rt_monitoring`.
   - Create DB migrations and run them against the local Postgres.
   - Configure Grafana data source to point to the local Postgres to visualize incidents and metrics.

Notes & Troubleshooting
- If Kafka fails to start, check Zookeeper logs. Zookeeper must be healthy before Kafka will come up.
- On some systems (Docker Desktop / Linux), advertised listeners may need tuning; `KAFKA_ADVERTISED_LISTENERS` is set for a common dev case but can require changes.
- This compose is intentionally minimal. For more advanced dev testing we can add Schema Registry, Kafka Connect, or MirrorMaker later.