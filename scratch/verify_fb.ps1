$r = Invoke-RestMethod -Uri 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/data/medicineLocations.json' -Method Get
Write-Host "Count from Firebase:" $r.Count
$withP = $r | Where-Object { $_.photoUrl -and $_.photoUrl.Length -gt 0 }
Write-Host "Items with photoUrl:" $withP.Count
for ($i=0; $i -lt [Math]::Min(5, $withP.Count); $i++) {
    $item = $withP[$i]
    Write-Host "  $($item.name) -> $($item.photoUrl) | photos: $($item.photos)"
}
