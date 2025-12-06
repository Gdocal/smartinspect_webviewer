#!/bin/bash
# Quick PM2 Health Check - returns exit code 0 if all services are healthy
# Useful for monitoring or CI/CD pipelines

EXPECTED_SERVICES=("smartinspect-server" "smartinspect-client")
FAILED=0

for service in "${EXPECTED_SERVICES[@]}"; do
    STATUS=$(pm2 show "$service" 2>/dev/null | grep "status" | awk '{print $4}')
    if [ "$STATUS" != "online" ]; then
        echo "UNHEALTHY: $service is ${STATUS:-not found}"
        FAILED=1
    fi
done

if [ $FAILED -eq 0 ]; then
    echo "HEALTHY: All services online"
    exit 0
else
    exit 1
fi
