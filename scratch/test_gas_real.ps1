$url = 'https://script.google.com/macros/s/AKfycbyhFnLdy53ExpzHW66UOm7hqmcBksBfKpYKtLQTUjxlng30FLevf9cdMSbqbeFO97x/exec'

$body = @{
    action = 'getBuildingRentalData'
    spreadsheetId = '1glbM8sF0h0Horjs4QBp2Ap13VzlvkI0MHpz_YbTbzdA'
    yymm = '2609'
    bypassCache = $true
} | ConvertTo-Json

try {
    $resp = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType 'text/plain;charset=utf-8'
    Write-Host "Success: $($resp.success)"
    Write-Host "CurrentYYMM: $($resp.data.currentYymm)"
    Write-Host "AvailableTabs: $($resp.data.availableTabs -join ', ')"
    Write-Host "ItemsCount: $($resp.data.items.Count)"
    Write-Host "TotalDeposit: $($resp.data.summary.totalDeposit)"
    Write-Host "TotalMyNetProfit: $($resp.data.summary.totalMyNetProfit)"
    Write-Host "GrimHouseReturnRate: $($resp.data.grimHouse.summary.returnRate)%"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
