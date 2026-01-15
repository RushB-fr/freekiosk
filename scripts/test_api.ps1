# =============================================================================
# FreeKiosk REST API Test Script (PowerShell)
# =============================================================================
# Usage: .\test_api.ps1 [-KioskIP "192.168.1.100"] [-ApiKey "mykey"]
# =============================================================================

param(
    [string]$KioskIP = "10.0.4.3",
    [int]$ApiPort = 8080,
    [string]$ApiKey = ""
)

$BaseUrl = "http://${KioskIP}:${ApiPort}"
$TestsPassed = 0
$TestsFailed = 0

# =============================================================================
# Helper Functions
# =============================================================================

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Blue
    Write-Host $Text -ForegroundColor Blue
    Write-Host "========================================" -ForegroundColor Blue
}

function Write-Test {
    param([string]$Text)
    Write-Host ""
    Write-Host "TEST: $Text" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Text)
    Write-Host "✓ PASS: $Text" -ForegroundColor Green
    $script:TestsPassed++
}

function Write-Failure {
    param([string]$Text)
    Write-Host "✗ FAIL: $Text" -ForegroundColor Red
    $script:TestsFailed++
}

function Invoke-ApiGet {
    param([string]$Endpoint)
    
    $headers = @{}
    if ($ApiKey) {
        $headers["X-Api-Key"] = $ApiKey
    }
    
    try {
        $response = Invoke-RestMethod -Uri "${BaseUrl}${Endpoint}" -Method Get -Headers $headers -ErrorAction Stop
        return $response
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-ApiPost {
    param(
        [string]$Endpoint,
        [hashtable]$Body = @{}
    )
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    if ($ApiKey) {
        $headers["X-Api-Key"] = $ApiKey
    }
    
    try {
        $response = Invoke-RestMethod -Uri "${BaseUrl}${Endpoint}" -Method Post -Headers $headers -Body ($Body | ConvertTo-Json) -ErrorAction Stop
        return $response
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Test-Response {
    param(
        [object]$Response,
        [string]$TestName,
        [string]$ExpectedField = ""
    )
    
    if ($Response.success -eq $true) {
        if ($ExpectedField -and -not ($Response | ConvertTo-Json).Contains($ExpectedField)) {
            Write-Failure "$TestName - Missing field: $ExpectedField"
            return $false
        }
        Write-Success $TestName
        return $true
    }
    else {
        Write-Failure $TestName
        Write-Host "Response: $($Response | ConvertTo-Json -Compress)" -ForegroundColor Gray
        return $false
    }
}

# =============================================================================
# Connection Test
# =============================================================================

Write-Header "FreeKiosk REST API Test Suite"
Write-Host "Target: $BaseUrl"
Write-Host "API Key: $(if ($ApiKey) { '(set)' } else { '(none)' })"

Write-Test "Connection Test"
try {
    $response = Invoke-ApiGet "/api/health"
    if ($response.success) {
        Write-Success "Health check - Connected!"
    }
    else {
        Write-Failure "Cannot connect to $BaseUrl"
        Write-Host "Make sure FreeKiosk is running and REST API is enabled."
        exit 1
    }
}
catch {
    Write-Failure "Cannot connect to $BaseUrl"
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# =============================================================================
# GET Endpoints Tests
# =============================================================================

Write-Header "GET Endpoints (Read-Only)"

# Test: Root endpoint
Write-Test "GET / - API Info"
$response = Invoke-ApiGet "/"
Test-Response $response "Root endpoint"
Write-Host "API: $($response.data.name) v$($response.data.version)" -ForegroundColor Cyan

# Test: Full status
Write-Test "GET /api/status - Full Status"
$response = Invoke-ApiGet "/api/status"
Test-Response $response "Full status"
if ($response.success) {
    Write-Host "Battery: $($response.data.battery.level)% (charging: $($response.data.battery.charging))" -ForegroundColor Cyan
    Write-Host "Screen: on=$($response.data.screen.on), brightness=$($response.data.screen.brightness)%" -ForegroundColor Cyan
    Write-Host "WiFi: $($response.data.wifi.ssid) (connected: $($response.data.wifi.connected))" -ForegroundColor Cyan
}

# Test: Battery
Write-Test "GET /api/battery - Battery Info"
$response = Invoke-ApiGet "/api/battery"
Test-Response $response "Battery endpoint"
Write-Host "Result: $($response.data | ConvertTo-Json -Compress)" -ForegroundColor Cyan

# Test: Brightness
Write-Test "GET /api/brightness - Brightness"
$response = Invoke-ApiGet "/api/brightness"
Test-Response $response "Brightness endpoint"
Write-Host "Result: $($response.data | ConvertTo-Json -Compress)" -ForegroundColor Cyan

# Test: Screen
Write-Test "GET /api/screen - Screen State"
$response = Invoke-ApiGet "/api/screen"
Test-Response $response "Screen endpoint"
Write-Host "Result: $($response.data | ConvertTo-Json -Compress)" -ForegroundColor Cyan

# Test: WiFi
Write-Test "GET /api/wifi - WiFi Info"
$response = Invoke-ApiGet "/api/wifi"
Test-Response $response "WiFi endpoint"
Write-Host "Result: $($response.data | ConvertTo-Json -Compress)" -ForegroundColor Cyan

# Test: Device Info
Write-Test "GET /api/info - Device Info"
$response = Invoke-ApiGet "/api/info"
Test-Response $response "Info endpoint"
Write-Host "Result: $($response.data | ConvertTo-Json -Compress)" -ForegroundColor Cyan

# Test: Health
Write-Test "GET /api/health - Health Check"
$response = Invoke-ApiGet "/api/health"
Test-Response $response "Health endpoint"
Write-Host "Result: $($response.data | ConvertTo-Json -Compress)" -ForegroundColor Cyan

# =============================================================================
# POST Endpoints Tests (Control)
# =============================================================================

Write-Header "POST Endpoints (Control)"
Write-Host "Note: These tests will actually control the device!" -ForegroundColor Yellow
$confirm = Read-Host "Continue with control tests? (y/N)"

if ($confirm -eq "y" -or $confirm -eq "Y") {

    # Test: Set Brightness
    Write-Test "POST /api/brightness - Set Brightness to 75%"
    $response = Invoke-ApiPost "/api/brightness" @{ value = 75 }
    Test-Response $response "Set brightness"
    
    Start-Sleep -Seconds 1

    # Test: Set Brightness back
    Write-Test "POST /api/brightness - Set Brightness back to 50%"
    $response = Invoke-ApiPost "/api/brightness" @{ value = 50 }
    Test-Response $response "Set brightness back"

    # Test: Reload
    Write-Test "POST /api/reload - Reload WebView"
    $response = Invoke-ApiPost "/api/reload"
    Test-Response $response "Reload WebView"

    Start-Sleep -Seconds 2

    # Test: Wake
    Write-Test "POST /api/wake - Wake Device"
    $response = Invoke-ApiPost "/api/wake"
    Test-Response $response "Wake device"

    # Test: Navigate to URL
    Write-Test "POST /api/url - Navigate to URL"
    $response = Invoke-ApiPost "/api/url" @{ url = "https://example.com" }
    Test-Response $response "Navigate URL"

    Start-Sleep -Seconds 2

    # Test: Screensaver On
    Write-Test "POST /api/screensaver/on - Activate Screensaver"
    $response = Invoke-ApiPost "/api/screensaver/on"
    Test-Response $response "Screensaver on"

    Start-Sleep -Seconds 3

    # Test: Screensaver Off
    Write-Test "POST /api/screensaver/off - Deactivate Screensaver"
    $response = Invoke-ApiPost "/api/screensaver/off"
    Test-Response $response "Screensaver off"
}
else {
    Write-Host "Skipping control tests." -ForegroundColor Gray
}

# =============================================================================
# Error Handling Tests
# =============================================================================

Write-Header "Error Handling Tests"

# Test: Invalid endpoint
Write-Test "GET /api/invalid - 404 Not Found"
$response = Invoke-ApiGet "/api/invalid"
if ($response.success -eq $false) {
    Write-Success "404 handling"
}
else {
    Write-Failure "404 handling"
}

# Test: Invalid brightness value
Write-Test "POST /api/brightness - Invalid Value (150)"
$response = Invoke-ApiPost "/api/brightness" @{ value = 150 }
if ($response.success -eq $false) {
    Write-Success "Invalid value handling"
}
else {
    Write-Failure "Invalid value handling"
}

# Test: Missing URL
Write-Test "POST /api/url - Missing URL"
$response = Invoke-ApiPost "/api/url" @{}
if ($response.success -eq $false) {
    Write-Success "Missing parameter handling"
}
else {
    Write-Failure "Missing parameter handling"
}

# =============================================================================
# Summary
# =============================================================================

Write-Header "Test Summary"
Write-Host "Tests Passed: $TestsPassed" -ForegroundColor Green
Write-Host "Tests Failed: $TestsFailed" -ForegroundColor Red
Write-Host ""

if ($TestsFailed -eq 0) {
    Write-Host "All tests passed! ✓" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "Some tests failed. ✗" -ForegroundColor Red
    exit 1
}
