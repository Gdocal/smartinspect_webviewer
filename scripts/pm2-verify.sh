#!/bin/bash
# PM2 Verification Script for SmartInspect Web Viewer
# Checks that PM2 services are running correctly

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=============================================="
echo "  SmartInspect PM2 Verification"
echo "=============================================="
echo ""

# Check PM2 is installed
echo -n "Checking PM2 installation... "
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}OK${NC} ($(pm2 --version))"
else
    echo -e "${RED}FAILED${NC} - PM2 not found"
    exit 1
fi

# Check PM2 daemon is running
echo -n "Checking PM2 daemon... "
if pm2 ping &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC} - PM2 daemon not running"
    exit 1
fi

# Check smartinspect-server
echo -n "Checking smartinspect-server... "
SERVER_STATUS=$(pm2 show smartinspect-server 2>/dev/null | grep "status" | awk '{print $4}')
if [ "$SERVER_STATUS" = "online" ]; then
    echo -e "${GREEN}ONLINE${NC}"
elif [ -z "$SERVER_STATUS" ]; then
    echo -e "${RED}NOT FOUND${NC}"
else
    echo -e "${RED}$SERVER_STATUS${NC}"
fi

# Check smartinspect-client
echo -n "Checking smartinspect-client... "
CLIENT_STATUS=$(pm2 show smartinspect-client 2>/dev/null | grep "status" | awk '{print $4}')
if [ "$CLIENT_STATUS" = "online" ]; then
    echo -e "${GREEN}ONLINE${NC}"
elif [ -z "$CLIENT_STATUS" ]; then
    echo -e "${RED}NOT FOUND${NC}"
else
    echo -e "${RED}$CLIENT_STATUS${NC}"
fi

# Check ports
echo ""
echo "Checking ports..."

echo -n "  Port 5173 (Vite client)... "
if ss -tlnp 2>/dev/null | grep -q ":5173 " || netstat -tlnp 2>/dev/null | grep -q ":5173 "; then
    echo -e "${GREEN}LISTENING${NC}"
else
    echo -e "${YELLOW}NOT LISTENING${NC} (may still be starting)"
fi

echo -n "  Port 5174 (Express API)... "
if ss -tlnp 2>/dev/null | grep -q ":5174 " || netstat -tlnp 2>/dev/null | grep -q ":5174 "; then
    echo -e "${GREEN}LISTENING${NC}"
else
    echo -e "${YELLOW}NOT LISTENING${NC} (may still be starting)"
fi

echo -n "  Port 4229 (TCP intake)... "
if ss -tlnp 2>/dev/null | grep -q ":4229 " || netstat -tlnp 2>/dev/null | grep -q ":4229 "; then
    echo -e "${GREEN}LISTENING${NC}"
else
    echo -e "${YELLOW}NOT LISTENING${NC} (may still be starting)"
fi

# Check startup persistence
echo ""
echo -n "Checking PM2 startup persistence... "
if systemctl is-enabled pm2-gdocal &> /dev/null; then
    echo -e "${GREEN}ENABLED${NC}"
else
    echo -e "${YELLOW}NOT ENABLED${NC} - Run: pm2 startup"
fi

echo -n "Checking PM2 saved process list... "
if [ -f ~/.pm2/dump.pm2 ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}NOT SAVED${NC} - Run: pm2 save"
fi

# Get network IP for WSL access
echo ""
echo "=============================================="
echo "  Access URLs (for WSL)"
echo "=============================================="
IP=$(hostname -I | awk '{print $1}')
echo "  Client: http://${IP}:5173/"
echo "  API:    http://${IP}:5174/"
echo ""

# Show PM2 status
echo "=============================================="
echo "  PM2 Process Status"
echo "=============================================="
pm2 status

exit 0
