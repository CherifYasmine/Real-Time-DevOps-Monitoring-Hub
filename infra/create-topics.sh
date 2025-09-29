#!/usr/bin/env bash
# infra/create-topics.sh
# Idempotent script to create project Kafka topics for local dev / CI.
# Usage: ./infra/create-topics.sh

set -euo pipefail

BROKER=${BROKER:-localhost:9092}
CONTAINER=${CONTAINER:-rtmh_kafka}
RETRIES=${RETRIES:-15}
SLEEP=${SLEEP:-2}

TOPICS=(
  "rtmh.logs:3:1"
  "rtmh.metrics:3:1"
  "rtmh.events:3:1"
)

wait_for_kafka() {
  echo "Waiting for Kafka at ${BROKER} to be available..."
  i=0
  while [ $i -lt $RETRIES ]; do
    if docker exec ${CONTAINER} kafka-broker-api-versions --bootstrap-server ${BROKER} >/dev/null 2>&1; then
      echo "Kafka is available"
      return 0
    fi
    i=$((i+1))
    sleep ${SLEEP}
  done
  echo "Timed out waiting for Kafka at ${BROKER}" >&2
  return 1
}

create_topic() {
  local name=$1
  local parts=$2
  local rf=$3
  echo "Creating topic ${name} (partitions=${parts}, replication=${rf}) if missing..."
  if docker exec ${CONTAINER} kafka-topics --bootstrap-server ${BROKER} --create --topic ${name} --partitions ${parts} --replication-factor ${rf} >/dev/null 2>&1; then
    echo "Created ${name}"
  else
    # If creation failed, show whether topic exists
    if docker exec ${CONTAINER} kafka-topics --bootstrap-server ${BROKER} --list | grep -x "${name}" >/dev/null 2>&1; then
      echo "Topic ${name} already exists"
    else
      echo "Failed to create topic ${name}" >&2
      docker exec ${CONTAINER} kafka-topics --bootstrap-server ${BROKER} --describe --topic ${name} || true
      return 1
    fi
  fi
}

main() {
  wait_for_kafka

  for t in "${TOPICS[@]}"; do
    IFS=":" read -r name parts rf <<< "$t"
    create_topic "$name" "$parts" "$rf"
  done

  echo "All topics processed. Listing topics:"
  docker exec ${CONTAINER} kafka-topics --bootstrap-server ${BROKER} --list
}

main "$@"
