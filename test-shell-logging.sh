#!/bin/bash
# Test script for SmartInspect shell logging
# Tests both HTTP endpoint and named pipe with all options

SI_HOST="${SI_HOST:-localhost:5174}"
SI_PIPE="/tmp/smartinspect.pipe"

echo "=========================================="
echo "SmartInspect Shell Logging Test"
echo "=========================================="
echo "Server: $SI_HOST"
echo "Pipe: $SI_PIPE"
echo ""

# Colors for output
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

sleep_time=0.3

echo -e "${CYAN}=== Testing HTTP Endpoint ===${RESET}"
echo ""

# Test 1: Basic message
echo -e "${GREEN}[HTTP] Basic message${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log" -d "HTTP Test: Basic message"
sleep $sleep_time

# Test 2: With level
echo -e "${GREEN}[HTTP] With level=info${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=info" -d "HTTP Test: Info level message"
sleep $sleep_time

echo -e "${YELLOW}[HTTP] With level=warning${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=warning" -d "HTTP Test: Warning level message"
sleep $sleep_time

echo -e "${RED}[HTTP] With level=error${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=error" -d "HTTP Test: Error level message"
sleep $sleep_time

# Test 3: With app name
echo -e "${GREEN}[HTTP] With app=test-script${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=info&app=test-script" -d "HTTP Test: Custom app name"
sleep $sleep_time

# Test 4: With session
echo -e "${GREEN}[HTTP] With session=Database${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=info&app=test-script&session=Database" -d "HTTP Test: Database session"
sleep $sleep_time

echo -e "${GREEN}[HTTP] With session=API${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=info&app=test-script&session=API" -d "HTTP Test: API session"
sleep $sleep_time

echo -e "${GREEN}[HTTP] With session=WebSocket${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=info&app=test-script&session=WebSocket" -d "HTTP Test: WebSocket session"
sleep $sleep_time

# Test 5: With room
echo -e "${GREEN}[HTTP] With room=testroom${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=info&app=test-script&room=testroom" -d "HTTP Test: testroom via param"
sleep $sleep_time

echo -e "${GREEN}[HTTP] With room=testroom and session=Database${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=info&app=test-script&room=testroom&session=Database" -d "HTTP Test: testroom with Database session"
sleep $sleep_time

echo -e "${GREEN}[HTTP] With room=testroom and session=API${RESET}"
curl -s -X POST "http://${SI_HOST}/api/log?level=warning&app=test-script&room=testroom&session=API" -d "HTTP Test: testroom with API session"
sleep $sleep_time

# Test 6: All log levels
echo -e "${CYAN}[HTTP] Testing all levels${RESET}"
for level in debug verbose info warning error fatal; do
    curl -s -X POST "http://${SI_HOST}/api/log?level=${level}&app=level-test&session=Levels" -d "HTTP Test: ${level} level"
    sleep $sleep_time
done

echo ""
echo -e "${CYAN}=== Testing Named Pipe ===${RESET}"
echo ""

# Check if pipe exists
if [ ! -p "$SI_PIPE" ]; then
    echo -e "${RED}Named pipe not found at $SI_PIPE${RESET}"
    echo "Make sure the server is running with pipe enabled"
else
    # Test 1: Simple message
    echo -e "${GREEN}[PIPE] Simple message${RESET}"
    echo "Pipe Test: Simple message" > "$SI_PIPE"
    sleep $sleep_time

    # Test 2: With level prefix
    echo -e "${GREEN}[PIPE] INFO: prefix${RESET}"
    echo "INFO: Pipe Test: Info level" > "$SI_PIPE"
    sleep $sleep_time

    echo -e "${YELLOW}[PIPE] WARNING: prefix${RESET}"
    echo "WARNING: Pipe Test: Warning level" > "$SI_PIPE"
    sleep $sleep_time

    echo -e "${RED}[PIPE] ERROR: prefix${RESET}"
    echo "ERROR: Pipe Test: Error level" > "$SI_PIPE"
    sleep $sleep_time

    # Test 3: With room prefix
    echo -e "${GREEN}[PIPE] [testroom] prefix${RESET}"
    echo "[testroom] INFO: Pipe Test: Custom room via prefix" > "$SI_PIPE"
    sleep $sleep_time

    # Test 4: JSON format with all options
    echo -e "${GREEN}[PIPE] JSON format with session${RESET}"
    echo '{"level":"info","message":"Pipe Test: JSON with Database session","app":"json-test","room":"default","session":"Database"}' > "$SI_PIPE"
    sleep $sleep_time

    echo '{"level":"warning","message":"Pipe Test: JSON with API session","app":"json-test","room":"default","session":"API"}' > "$SI_PIPE"
    sleep $sleep_time

    echo '{"level":"error","message":"Pipe Test: JSON with WebSocket session","app":"json-test","room":"default","session":"WebSocket"}' > "$SI_PIPE"
    sleep $sleep_time

    # Test 5: JSON format with testroom
    echo -e "${GREEN}[PIPE] JSON format with testroom${RESET}"
    echo '{"level":"info","message":"Pipe Test: JSON testroom","app":"json-test","room":"testroom","session":"Main"}' > "$SI_PIPE"
    sleep $sleep_time

    echo '{"level":"info","message":"Pipe Test: JSON testroom with Database","app":"json-test","room":"testroom","session":"Database"}' > "$SI_PIPE"
    sleep $sleep_time

    echo '{"level":"warning","message":"Pipe Test: JSON testroom with API","app":"json-test","room":"testroom","session":"API"}' > "$SI_PIPE"
    sleep $sleep_time

    # Test 5: All levels via pipe
    echo -e "${CYAN}[PIPE] Testing all levels via JSON${RESET}"
    for level in debug verbose info warning error fatal; do
        echo "{\"level\":\"${level}\",\"message\":\"Pipe Test: ${level} level\",\"app\":\"level-test\",\"session\":\"Levels\"}" > "$SI_PIPE"
        sleep $sleep_time
    done
fi

echo ""
echo -e "${CYAN}=== Test Complete ===${RESET}"
echo "Check SmartInspect Web Viewer at http://${SI_HOST}"
echo ""
echo "Expected results:"
echo "  - HTTP tests: app='test-script', 'level-test', or 'shell'"
echo "  - Pipe tests: app='json-test', 'level-test', or 'shell'"
echo "  - Sessions: Main, Database, API, WebSocket, Levels"
echo "  - Levels: debug, verbose, info, warning, error, fatal"
