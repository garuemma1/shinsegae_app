[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$fbUrl = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/data/expiryReturns.json'
$res = Invoke-RestMethod -Uri $fbUrl -Method Get

foreach ($item in $res) {
    Write-Host "Name: $($item.drugName) | ID: $($item.id) | photos: $($item.photos)"
}
