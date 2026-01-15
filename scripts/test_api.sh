#!/bin/bash
# =============================================================================
# FreeKiosk REST API Test Script
# =============================================================================
# Usage: ./test_api.sh [KIOSK_IP] [API_KEY]
# Example: ./test_api.sh 192.168.1.100 myapikey123
# =============================================================================

# Configuration
KIOSK_IP="${1:-10.0.4.3}"
API_PORT="${API_PORT:-8080}"
API_KEY="${2:-}"
BASE_URL="http://${KIOSK_IP}:${API_PORT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_test() {
    echo -e "\n${YELLOW}TEST: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ PASS: $1${NC}"
    ((TESTS_PASSED++))
}

print_failure() {
    echo -e "${RED}✗ FAIL: $1${NC}"
    ((TESTS_FAILED++))
}

# Build curl command with optional API key
curl_get() {
    local endpoint="$1"
    if [ -n "$API_KEY" ]; then
        curl -s -H "X-Api-Key: $API_KEY" "${BASE_URL}${endpoint}"
    else
        curl -s "${BASE_URL}${endpoint}"
    fi
}

curl_post() {
    local endpoint="$1"
    local data="$2"
    if [ -n "$API_KEY" ]; then
        curl -s -X POST -H "Content-Type: application/json" -H "X-Api-Key: $API_KEY" -d "$data" "${BASE_URL}${endpoint}"
    else
        curl -s -X POST -H "Content-Type: application/json" -d "$data" "${BASE_URL}${endpoint}"
    fi
}

check_response() {
    local response="$1"
    local test_name="$2"
    local expected_field="$3"
    
    if echo "$response" | grep -q '"success":true'; then
        if [ -n "$expected_field" ]; then
            if echo "$response" | grep -q "$expected_field"; then
                print_success "$test_name"
                return 0
            else
                print_failure "$test_name - Missing field: $expected_field"
                return 1
            fi
        else
            print_success "$test_name"
            return 0
        fi
    else
        print_failure "$test_name"
        echo "Response: $response"
        return 1
    fi
}

# =============================================================================
# Connection Test
# =============================================================================

print_header "FreeKiosk REST API Test Suite"
echo "Target: $BASE_URL"
echo "API Key: ${API_KEY:-'(none)'}"

print_test "Connection Test"
response=$(curl_get "/api/health" 2>&1)
if [ $? -ne 0 ] || [ -z "$response" ]; then
    print_failure "Cannot connect to $BASE_URL"
    echo "Make sure FreeKiosk is running and REST API is enabled."
    exit 1
fi
check_response "$response" "Health check" '"status":"ok"'

# =============================================================================
# GET Endpoints Tests
# =============================================================================

print_header "GET Endpoints (Read-Only)"

# Test: Root endpoint
print_test "GET / - API Info"
response=$(curl_get "/")
check_response "$response" "Root endpoint" '"name":"FreeKiosk REST API"'

# Test: Full status
print_test "GET /api/status - Full Status"
response=$(curl_get "/api/status")
check_response "$response" "Full status" '"battery"'
echo "Status preview: $(echo $response | head -c 200)..."

# Test: Battery
print_test "GET /api/battery - Battery Info"
response=$(curl_get "/api/battery")
check_response "$response" "Battery endpoint" '"level"'
echo "Response: $response"

# Test: Brightness
print_test "GET /api/brightness - Brightness"
response=$(curl_get "/api/brightness")
check_response "$response" "Brightness endpoint" '"brightness"'
echo "Response: $response"

# Test: Screen
print_test "GET /api/screen - Screen State"
response=$(curl_get "/api/screen")
check_response "$response" "Screen endpoint" '"on"'
echo "Response: $response"

# Test: WiFi
print_test "GET /api/wifi - WiFi Info"
response=$(curl_get "/api/wifi")
check_response "$response" "WiFi endpoint" '"connected"'
echo "Response: $response"

# Test: Device Info
print_test "GET /api/info - Device Info"
response=$(curl_get "/api/info")
check_response "$response" "Info endpoint" '"version"'
echo "Response: $response"

# Test: Health
print_test "GET /api/health - Health Check"
response=$(curl_get "/api/health")
check_response "$response" "Health endpoint" '"status":"ok"'
echo "Response: $response"

# =============================================================================
# POST Endpoints Tests (Control)
# =============================================================================

print_header "POST Endpoints (Control)"
echo -e "${YELLOW}Note: These tests will actually control the device!${NC}"
read -p "Continue with control tests? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping control tests."
else

    # Test: Set Brightness
    print_test "POST /api/brightness - Set Brightness to 75%"
    response=$(curl_post "/api/brightness" '{"value": 75}')
    check_response "$response" "Set brightness" '"executed"'
    echo "Response: $response"

    sleep 1

    # Test: Set Brightness to 50%
    print_test "POST /api/brightness - Set Brightness back to 50%"
    response=$(curl_post "/api/brightness" '{"value": 50}')
    check_response "$response" "Set brightness back" '"executed"'

    # Test: Reload
    print_test "POST /api/reload - Reload WebView"
    response=$(curl_post "/api/reload" '{}')
    check_response "$response" "Reload WebView" '"executed"'
    echo "Response: $response"

    sleep 2

    # Test: Wake
    print_test "POST /api/wake - Wake Device"
    response=$(curl_post "/api/wake" '{}')
    check_response "$response" "Wake device" '"executed"'
    echo "Response: $response"

    # Test: Navigate to URL
    print_test "POST /api/url - Navigate to URL"
    response=$(curl_post "/api/url" '{"url": "https://example.com"}')
    check_response "$response" "Navigate URL" '"executed"'
    echo "Response: $response"

    sleep 2

    # Test: Screensaver On
    print_test "POST /api/screensaver/on - Activate Screensaver"
    response=$(curl_post "/api/screensaver/on" '{}')
    check_response "$response" "Screensaver on" '"executed"'
    echo "Response: $response"

    sleep 3

    # Test: Screensaver Off
    print_test "POST /api/screensaver/off - Deactivate Screensaver"
    response=$(curl_post "/api/screensaver/off" '{}')
    check_response "$response" "Screensaver off" '"executed"'
    echo "Response: $response"

fi

# =============================================================================
# Error Handling Tests
# =============================================================================

print_header "Error Handling Tests"

# Test: Invalid endpoint
print_test "GET /api/invalid - 404 Not Found"
response=$(curl_get "/api/invalid")
if echo "$response" | grep -q '"success":false'; then
    print_success "404 handling"
else
    print_failure "404 handling"
fi
echo "Response: $response"

# Test: Invalid brightness value
print_test "POST /api/brightness - Invalid Value"
response=$(curl_post "/api/brightness" '{"value": 150}')
if echo "$response" | grep -q '"success":false'; then
    print_success "Invalid value handling"
else
    print_failure "Invalid value handling"
fi
echo "Response: $response"

# Test: Missing URL
print_test "POST /api/url - Missing URL"
response=$(curl_post "/api/url" '{}')
if echo "$response" | grep -q '"success":false'; then
    print_success "Missing parameter handling"
else
    print_failure "Missing parameter handling"
fi
echo "Response: $response"

# =============================================================================
# Summary
# =============================================================================

print_header "Test Summary"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. ✗${NC}"
    exit 1
fi
