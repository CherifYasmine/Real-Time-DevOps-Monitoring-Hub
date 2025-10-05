#!/bin/bash
# Generate logs, metrics, and events for multiple projects using curl
# Usage: bash generate_test_data.sh

PRODUCER_URL="${PRODUCER_URL:-http://localhost:4000}"
PROJECTS=("alpha" "beta" "gamma")

# Example log data (see backend/README.md for more fields)
LOG_DATA='{ "level": "error", "msg": "Payment processing failed", "service": "payment-service", "user_id": "user_123", "amount": 99.99, "currency": "USD", "error_code": "CARD_DECLINED", "timestamp": "2025-10-03T10:30:00Z" }'

# Example metric data
METRIC_DATA='{ "response_time": 850, "endpoint": "/api/orders", "status_code": 500, "timestamp": "2025-10-03T10:30:00Z" }'

# Example event data
EVENT_DATA='{ "type": "deployment", "service": "api", "version": "v1.2.3", "environment": "prod", "message": "Deployment event", "timestamp": "2025-10-03T10:30:00Z" }'

for project in "${PROJECTS[@]}"; do
  echo "Sending log for project: $project"
  curl -s -X POST "$PRODUCER_URL/logs" \
    -H "Content-Type: application/json" \
    -d "{\"project\":\"$project\",\"value\":$LOG_DATA}"

  echo "Sending metric for project: $project"
  curl -s -X POST "$PRODUCER_URL/metrics" \
    -H "Content-Type: application/json" \
    -d "{\"project\":\"$project\",\"value\":$METRIC_DATA}"

  echo "Sending event for project: $project"
  curl -s -X POST "$PRODUCER_URL/events" \
    -H "Content-Type: application/json" \
    -d "{\"project\":\"$project\",\"value\":$EVENT_DATA}"

done

echo "Test data sent for projects: ${PROJECTS[*]}"
# See backend/README.md for more example fields and payloads
