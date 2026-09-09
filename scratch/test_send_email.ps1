$body = @{
    action = 'sendPaystubEmail'
    email = 'mikii1123@naver.com'
    name = '이정은'
    year = 2026
    month = 9
    netSalary = 2472470
    preTax = 2717000
    totalDeduction = 244530
    fileUrl = ''
    note = '테스트 급여명세서 발송입니다.'
    url = 'https://garuemma1.github.io/shinsegae_app/'
} | ConvertTo-Json

try {
    $raw = Invoke-WebRequest -Uri 'https://script.google.com/macros/s/AKfycbx3JgVr9e_wGnO6Bvp2uE_7lamAf_Ii22cLpCyo5OGquAiNypiWA1FCDJSHnw4qqFPMJg/exec' -Method Post -Body $body -ContentType 'text/plain;charset=utf-8'
    Write-Host "StatusCode: $($raw.StatusCode)"
    Write-Host "Content: $($raw.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
