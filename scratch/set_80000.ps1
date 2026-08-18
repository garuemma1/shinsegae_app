$res = Invoke-RestMethod -Uri 'https://shinsegaeapp.vercel.app/api/sync' -Method Get
$emps = $res.data.employees
foreach ($e in $emps) {
    if ($e.id -eq 'emp_2') {
        $e.weekdayRate = 80000
        $e.holidayRate = 20000
        $e.hourlyRate = 80000
        $e.updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
}
$res.data.employees = $emps
if ($res.data.pharmacistRates -and $res.data.pharmacistRates.emp_2) {
    $res.data.pharmacistRates.emp_2.weekdayRate = 80000
    $res.data.pharmacistRates.emp_2.holidayRate = 20000
}

$jsonBody = $res | ConvertTo-Json -Depth 10
$postRes = Invoke-RestMethod -Uri 'https://shinsegaeapp.vercel.app/api/sync' -Method Post -Body $jsonBody -ContentType 'application/json'
Write-Host "Sync post result:" ($postRes | ConvertTo-Json)
