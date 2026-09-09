$name = [string]::Concat([char]0xC774, [char]0xC815, [char]0xC740)
$note = [string]::Concat([char]0xC2E0, [char]0xC138, [char]0xACC4, [char]0xC57D, [char]0xAD6D, ' 8', [char]0xC6D4, ' ', [char]0xAE09, [char]0xC5EC, [char]0xBA85, [char]0xC138, [char]0xC11C, [char]0xC785, [char]0xB2C8, [char]0xB2E4, '.')

$bodyObj = @{
    action = 'sendPaystubEmail'
    email = 'miki1123@naver.com'
    name = $name
    year = 2026
    month = 8
    netSalary = 2472470
    preTax = 2717000
    totalDeduction = 244530
    fileUrl = ''
    note = $note
    url = 'https://garuemma1.github.io/shinsegae_app/'
}

$json = $bodyObj | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

$realUrl = 'https://script.google.com/macros/s/AKfycbyhPnLdy53ExpzHW66U0m7hqmcBksBfKpFYkILQTUjxtng30FLevf9cdMSbqbeYQ97x/exec'
$resp = Invoke-WebRequest -Uri $realUrl -Method Post -Body $bytes -ContentType "text/plain; charset=utf-8" -UseBasicParsing -MaximumRedirection 10
Write-Host "StatusCode: $($resp.StatusCode)"
Write-Host "Response: $($resp.Content)"
