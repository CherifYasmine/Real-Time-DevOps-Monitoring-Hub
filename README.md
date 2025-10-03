# Real-Time DevOps Monitoring Hub

A lightweight, extendable monitoring hub that will collect logs, metrics and events from multiple services, push them into Kafka, process them in real-time, and surface incidents/alerts into Postgres + Grafana (and later a React UI). Think of this as a mini Datadog for your own infra.

This README now focuses on the high-level plan and the explicit implementation steps we will follow. It intentionally omits implementation code, SQL, docker compose YAML, and other examples until we start that part of the work.

## Goals

- Define an end-to-end pipeline for collecting and processing observability data (logs, metrics, events).
- Use Kafka as the central message bus for durability and buffering.
- Build a Node.js backend to accept, validate, and publish incoming data to Kafka topics.
- Implement real-time processors that consume Kafka topics, compute aggregates, detect incidents, and persist results into Postgres.
- Surface data to Grafana (via Postgres) and provide alerting via Slack and Email.

## High-level architecture

- Ingestion: lightweight producer API(s) that receive logs/metrics/events from services and push them to Kafka topics.
- Processing: consumers that perform windowed aggregations (error rates, counts) and detect incident conditions.
- Persistence: Postgres will store incidents, aggregates, and any persisted raw events we need for analysis.
- Visualization: Grafana reads from Postgres for dashboards and exploratory queries.
- Notifications: Alert dispatcher sends notifications to Slack and Email based on alert rules.

## Implementation roadmap (step-by-step)

We will implement the project in clear iterative steps. Each step includes acceptance criteria so we can verify progress.

1) Project scaffolding and infra (dev):
   - Create repository structure with folders: `backend/producer`, `processor/consumer`, `infra/`, `dashboard/`, `frontend/`.
   - Add `docker-compose.yml` to bring up Kafka (dev), Zookeeper, Postgres, and Grafana for local development.
   - Acceptance: `docker compose up` brings services up.

2) Backend producer API (Node.js + Express):
   - Scaffold a small Express service that exposes HTTP endpoints to accept logs, metrics, and events.
   - Implement input validation, JSON parsing, and environment-driven configuration for Kafka brokers.
   - Wire a Kafka producer client and publish received messages to dedicated topics.
   - Acceptance: HTTP POST to producer returns 2xx and messages are published to Kafka (verified with a consumer tool).

3) Processor service (Kafka consumers):
   - Implement consumer(s) that subscribe to the topics and perform real-time processing.
   - Implement sliding-window aggregations for metrics and error-rate calculations for logs.
   - When an alert rule is met, create an incident record and emit an incident event.
   - Acceptance: Processor consumes messages and emits incident events for simulated test data.

4) Database schema & migrations:
   - Design minimal schema for storing incidents, aggregated metrics, and optionally raw events.
   - Add migration scripts (using a migration tool) to create the schema in Postgres.
   - Acceptance: Migrations run successfully against the Postgres dev instance.

5) Alerting engine (notifications):
   - Implement alert evaluation logic (e.g., error rate threshold over time windows).
   - Integrate with Slack via Incoming Webhooks and Email via SMTP (Nodemailer) for notifications.
   - Add deduplication and state transitions (triggered, acknowledged, resolved).
   - Acceptance: When processors signal incidents, the alerting engine sends notifications and stores alert state.

6) Grafana dashboards and provisioning:
   - Configure Grafana to use Postgres as a datasource (provisioning files optional).
   - Create dashboards for key metrics, error rates, and incident lists.
   - Acceptance: Dashboards display stored aggregates and incidents.
   ✅ **COMPLETED**: Single provisioned dashboard (`RT Monitoring - Logs, Metrics & Events`) with Postgres datasource.

7) Frontend (Vite + TypeScript + Tailwind):
   - Scaffold a React app that lists incidents, provides detail pages, and allows acknowledging/silencing alerts.
   - Implement a small API client to read/write from the backend.
   - Acceptance: Frontend can list incidents and trigger acknowledge/silence actions.

8) Testing and CI:
   - Add unit tests for processor logic and integrations for producer -> processor -> DB flow.
   - Add CI pipeline (GitHub Actions) to run tests and linting on PRs.
   - Acceptance: CI runs tests and reports status for PRs.

## Current Implementation Status

### ✅ Completed Components

1. **Infrastructure (Docker Compose)**: Kafka, Zookeeper, Postgres, and Grafana containers with proper networking
2. **Producer API**: Node.js Express service with endpoints for `/logs`, `/metrics`, and `/events`
3. **Real-Time Processor**: Kafka consumers with sliding window aggregations and incident detection
4. **Database Schema**: Complete Postgres schema with migrations for raw events, aggregations, and incidents
5. **Grafana Dashboard**: Auto-provisioned Postgres datasource + single consolidated dashboard (logs, metrics, events)

### 🔄 Current Working Pipeline

```
HTTP POST → Producer API → Kafka Topics → Real-Time Processor → Postgres Database → Grafana Dashboards
```

### 📊 Observability View (Grafana)

Access Grafana at http://localhost:3000 (admin/admin) → Dashboard: `RT Monitoring - Logs, Metrics & Events`:
- Total counts per topic (logs / metrics / events)
- Log level breakdown
- Recent logs (last 20)
- Recent metrics (last 20)
- Recent events (last 20)
- Topic overview (counts + first/last timestamps)

### 🧪 Testing the System

```bash
# Start the infrastructure
cd infra && docker-compose up -d

# Apply database migrations
./migrate-docker.sh

# Send test data
curl -X POST http://localhost:4000/logs \
   -H "Content-Type: application/json" \
   -d '{"value": {"level": "error", "msg": "Database connection failed", "service": "api", "host": "server-01"}}'

curl -X POST http://localhost:4000/metrics \
   -H "Content-Type: application/json" \
   -d '{"value": {"response_time": 250, "endpoint": "/api/users", "status_code": 200}}'

# View results in Grafana: http://localhost:3000
```


## DevOps phases roadmap

Below is a plain-language, project-focused version of the deployment/infra roadmap you provided. Each phase describes what we'll do, why, the primary tools, and some learning targets.

Phase 0 — Repos & repository layout
- What: choose environments (dev/prod) and split code vs deployment manifests into two repos, e.g. `monitoring-app` (application code) and `monitoring-deploy` (Helm charts / manifests).
- Why: keeps runtime manifests and app code separate so GitOps can operate on declarative deploy manifests independently.
- Tools: GitHub (source control + CI), Helm (packaging and templating).

Phase 1 — CI identity & least-privilege access
- What: configure GitHub Actions to assume permissions in AWS via OIDC tokens rather than long-lived keys.
- Why: improves security by issuing short-lived credentials dynamically and reducing secret sprawl.
- Tools: GitHub Actions OIDC, AWS IAM trust policies and scoped roles.

Phase 2 — Container registry and image hygiene
- What: create a central container registry in AWS (ECR) for our service images; enable scan-on-push and lifecycle rules to remove old images.
- Why: centralized, secure storage with integrated scanning and lifecycle management.
- Tools: Amazon ECR.

Phase 3 — Cluster provisioning and core add-ons
- What: provision an EKS cluster via Terraform (or your IaC tool of choice) and install essential add-ons like Argo CD (GitOps), the Secrets Store CSI driver, and the AWS Load Balancer Controller.
- Why: reproducible infra, GitOps-driven deployments, secure secret handling, and cloud-native ingress.
- Tools: Terraform, EKS, Argo CD, Secrets Store CSI Driver, AWS Load Balancer Controller.

Phase 4 — Runtime identity and RBAC
- What: use IRSA to bind Kubernetes ServiceAccounts to scoped IAM roles and implement Kubernetes RBAC per namespace/workload.
- Why: enforce least privilege at both AWS and Kubernetes layers.
- Tools: IRSA, K8s RBAC.

Phase 5 — Secrets management
- What: store runtime secrets (API keys, credentials) in AWS Secrets Manager and surface them to pods via the Secrets Store CSI Driver.
- Why: avoid committing secrets to git; enable rotation and auditability.
- Tools: AWS Secrets Manager, Secrets Store CSI Driver.

Phase 6 — Continuous Integration (build, test, scan)
- What: build a CI pipeline that runs tests, linters, SAST, dependency checks, builds containers, scans images (Trivy) and pushes validated images to ECR.
- Why: shift-left security and consistent, reproducible builds.
- Tools: GitHub Actions, CodeQL/SonarCloud, Dependabot/OWASP checks, Trivy.

Phase 7 — Continuous Delivery (GitOps with Helm)
- What: publish Helm values (image tags) to the `monitoring-deploy` repo and let Argo CD sync those changes to the cluster.
- Why: Git is the single source of truth for runtime state, enabling easy rollbacks and auditability.
- Tools: Argo CD, Helm.

Phase 8 — Ingress, TLS and secure exposure
- What: expose public services with ALB Ingress and provision TLS certificates via AWS ACM; optionally add WAF rules for L7 protection.
- Why: secure, production-ready exposure with managed TLS and optional web filtering.
- Tools: AWS Load Balancer Controller, AWS ACM, AWS WAF (optional).

Phase 9 — Observability & runbooks
- What: wire up metrics, logs and tracing; create dashboards and alerts; document runbooks for common incidents.
- Why: improve reliability and mean time to resolution; measure SLOs.
- Tools: CloudWatch Alarms.

Phase 10 — Policy & supply-chain security
- What: enforce deployment policies (no `:latest`, require IRSA, ban privileged pods), and optionally adopt image signing for provenance.
- Why: enforce compliance and improve supply-chain confidence.
- Tools: Kyverno/OPA Gatekeeper, Cosign (sigstore).

Phase 11 — Cost management & hygiene
- What: adopt lifecycle rules, autoscaling, right-sizing and consider spot instances for non-critical workloads.
- Why: control costs while keeping environments healthy and maintainable.
- Tools: ECR lifecycle policies, Cluster Autoscaler, EC2 Spot Instances.

