$body = @{
    action = 'getBuildingRentalData'
    spreadsheetId = '1glbM8sF0h0Horjs4QBp2Ap13VzlvkI0MHpz_YbTbzdA'
    yymm = '2609'
    bypassCache = $true
} | ConvertTo-Json

try {
    $raw = Invoke-WebRequest -Uri 'https://script.google.com/macros/s/AKfycbx3JgVr9e_wGnO6Bvp2uE_7lamAf_Ii22cLpCyo5OGquAiNypiWA1FCDJSHnw4qqFPMJg/exec' -Method Post -Body $body -ContentType 'text/plain;charset=utf-8'
    Write-Host "StatusCode: $($raw.StatusCode)"
    Write-Host "Content: $($raw.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
