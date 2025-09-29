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

Creating & verifying Kafka topics (repeatable)
--------------------------------------------
Below are the exact commands we ran to create the three project topics and how to verify them. These are safe to re-run (creation is idempotent for existing topics).

1) Create topics (3 partitions, replication-factor=1 for single-broker dev):

```bash
docker exec rtmh_kafka \
   kafka-topics --bootstrap-server localhost:9092 --create --topic rtmh.logs \
      --partitions 3 --replication-factor 1

docker exec rtmh_kafka \
   kafka-topics --bootstrap-server localhost:9092 --create --topic rtmh.metrics \
      --partitions 3 --replication-factor 1

docker exec rtmh_kafka \
   kafka-topics --bootstrap-server localhost:9092 --create --topic rtmh.events \
      --partitions 3 --replication-factor 1
```

Notes:
- Use replication-factor=1 for this single-broker local setup. In production use RF >= 3.
- The Confluent tooling may warn about mixing dots and underscores in topic names; prefer one or the other to avoid metric name collisions.

2) Verify topics exist and inspect partition layout:

```bash
# list topics
docker exec rtmh_kafka kafka-topics --bootstrap-server localhost:9092 --list

# describe a topic (shows partition count, leader, replicas, ISR)
docker exec rtmh_kafka kafka-topics --bootstrap-server localhost:9092 --describe --topic rtmh.logs
```

Expected output (example for `rtmh.logs`):

```
Topic: rtmh.logs        PartitionCount: 3 ReplicationFactor: 1
Topic: rtmh.logs        Partition: 0    Leader: 1       Replicas: 1    Isr: 1
Topic: rtmh.logs        Partition: 1    Leader: 1       Replicas: 1    Isr: 1
Topic: rtmh.logs        Partition: 2    Leader: 1       Replicas: 1    Isr: 1
```

3) If a topic already exists you'll see a TopicExistsException; that's safe — the list/describe commands will confirm the current layout.
