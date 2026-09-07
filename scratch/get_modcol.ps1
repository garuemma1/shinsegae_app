$fbUrl = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/data/expiryReturns.json'
$res = Invoke-RestMethod -Uri $fbUrl -Method Get
$item = $res | Where-Object { $_.id -eq 'exp_1788752203968_377' }
$item | ConvertTo-Json -Depth 5
