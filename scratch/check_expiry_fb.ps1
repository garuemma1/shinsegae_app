$fbUrl = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/data/expiryReturns.json'
$res = Invoke-RestMethod -Uri $fbUrl -Method Get
$res | ConvertTo-Json -Depth 5
