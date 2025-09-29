# Makefile: convenience targets for infra management
# Usage: make infra-up | infra-stop | infra-down | infra-reset | infra-logs | infra-ps | infra-smoke

COMPOSE_FILE=infra/docker-compose.yml

.PHONY: infra-up infra-stop infra-down infra-reset infra-ps infra-logs infra-smoke

infra-up:
	docker-compose -f $(COMPOSE_FILE) up -d

infra-stop:
	docker-compose -f $(COMPOSE_FILE) stop

infra-down:
	docker-compose -f $(COMPOSE_FILE) down

# Remove containers, network, and volumes (use with caution)
infra-reset:
	docker-compose -f $(COMPOSE_FILE) down -v --remove-orphans

infra-ps:
	docker-compose -f $(COMPOSE_FILE) ps

infra-logs:
	docker-compose -f $(COMPOSE_FILE) logs -f

# Basic smoke test: check kafka, zookeeper, postgres and grafana ports
infra-smoke:
	@echo "Checking services..."
	@docker-compose -f $(COMPOSE_FILE) ps
	@echo "Kafka (9092):" && nc -zv localhost 9092 || true
	@echo "Zookeeper (2181):" && nc -zv localhost 2181 || true
	@echo "Postgres (5432):" && nc -zv localhost 5432 || true
	@echo "Grafana (3000):" && nc -zv localhost 3000 || true
