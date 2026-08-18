$ErrorActionPreference = "Stop"

Write-Host "Memolens research-ingest diagnostic" -ForegroundColor Cyan
Write-Host "This sends one synthetic analytics event only. It sends no recording, medication, caregiver, or participant data.`n"

$envFile = Join-Path (Get-Location) ".env.local"
if (-not (Test-Path $envFile)) {
  throw ".env.local was not found. Run this script from the Memolens project root."
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line.Split("=", 2)
    $vars[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
  }
}

$url = $vars["VITE_SUPABASE_URL"]
$key = $vars["VITE_SUPABASE_ANON_KEY"]
$transport = $vars["VITE_RESEARCH_TRANSPORT"]

if (-not $url) { throw "VITE_SUPABASE_URL is missing from .env.local" }
if (-not $key) { throw "VITE_SUPABASE_ANON_KEY is missing from .env.local" }
if ($transport -ne "edge") { Write-Warning "VITE_RESEARCH_TRANSPORT is '$transport', expected 'edge'." }

$url = $url.TrimEnd('/')
$endpoint = "$url/functions/v1/ingest"
$now = [DateTime]::UtcNow.ToString("o")
$requestId = [guid]::NewGuid().ToString()
$eventId = [guid]::NewGuid().ToString()
$sessionId = [guid]::NewGuid().ToString()

$payload = @{
  schema_version = "1.0"
  request_id = $requestId
  sent_at_utc = $now
  analytics_events = @(
    @{
      schema_version = "1.0"
      event_id = $eventId
      session_id = $sessionId
      sequence_number = 1
      occurred_at_utc = $now
      event_name = "landing_viewed"
      page_path = "/diagnostic"
      role_mode = ""
      workflow_step = "diagnostic"
      cta_id = ""
      source = "diagnostic_script"
      elapsed_ms = 0
      device_type = "desktop"
      browser_family = "diagnostic"
      os_family = "windows"
      language = "en"
      timezone = "UTC"
      online = $true
      analytics_consent_version = "diagnostic-v1"
      properties_json = @{ diagnostic = $true }
    }
  )
  test_sessions = @()
  leads = @()
} | ConvertTo-Json -Depth 8 -Compress

$headers = @{
  "apikey" = $key
  "Origin" = "http://localhost:5173"
}

Write-Host "Endpoint: $endpoint"
Write-Host "Transport in .env.local: $transport"
Write-Host "Key type: $($(if ($key.StartsWith('sb_publishable_')) {'publishable'} elseif ($key.Split('.').Count -eq 3) {'legacy_jwt'} else {'other'}))"
Write-Host "Request ID: $requestId`n"

try {
  $response = Invoke-WebRequest -Uri $endpoint -Method POST -Headers $headers -ContentType "application/json" -Body $payload -UseBasicParsing
  Write-Host "HTTP status: $($response.StatusCode)" -ForegroundColor Green
  if ($response.Headers["X-Memolens-Trace-Id"]) { Write-Host "Trace ID: $($response.Headers['X-Memolens-Trace-Id'])" }
  if ($response.Headers["X-Memolens-Stage"]) { Write-Host "Stage: $($response.Headers['X-Memolens-Stage'])" }
  Write-Host "Response: $($response.Content)"
} catch {
  $status = $null
  $body = $null
  $trace = $null
  $stage = $null
  if ($_.Exception.Response) {
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    try { $trace = $_.Exception.Response.Headers["X-Memolens-Trace-Id"] } catch {}
    try { $stage = $_.Exception.Response.Headers["X-Memolens-Stage"] } catch {}
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $reader.Close()
      }
    } catch {}
  }
  Write-Host "HTTP status: $status" -ForegroundColor Red
  if ($trace) { Write-Host "Trace ID: $trace" }
  if ($stage) { Write-Host "Stage: $stage" }
  if ($body) { Write-Host "Response: $body" } else { Write-Host "Error: $($_.Exception.Message)" }
  exit 1
}
