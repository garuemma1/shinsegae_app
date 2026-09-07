$res = Invoke-RestMethod -Uri 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/.json' -Method Get
$dids = $res.shinsegae_master_db.data.deletedIds
Write-Host "Total deletedIds count: $($dids.Count)"
$medDids = $dids | Where-Object { $_ -like "med_*" }
Write-Host "med_ deletedIds count: $($medDids.Count)"
$medDids | Select-Object -First 20
