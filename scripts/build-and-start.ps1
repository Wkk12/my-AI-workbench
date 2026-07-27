Set-Location C:\my-AI-workbench
$log = "C:\my-AI-workbench\build-log.txt"
"Build started at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $log -Encoding utf8

# Kill existing node
cmd /c "taskkill /F /IM node.exe" 2>$null
Start-Sleep 3

# Set PATH
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# Build
"Running next build..." | Out-File $log -Append -Encoding utf8
node node_modules\next\dist\bin\next build *>&1 | Out-File $log -Append -Encoding utf8
$exitCode = $LASTEXITCODE
"Build exit code: $exitCode" | Out-File $log -Append -Encoding utf8

if ($exitCode -eq 0) {
    "Build success. Starting production on port 3000..." | Out-File $log -Append -Encoding utf8
    $env:NODE_ENV = "production"
    node node_modules\next\dist\bin\next start -p 3000 -H 0.0.0.0 *>&1 | Out-File $log -Append -Encoding utf8
} else {
    "Build FAILED. Check build-log.txt for errors." | Out-File $log -Append -Encoding utf8
}
