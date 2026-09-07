$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations

$item = $meds | Where-Object { $_.name -eq '인사이가튼튼' }
Write-Host "인사이가튼튼 photos count: $($item.photos.Count)"
for ($i=0; $i -lt $item.photos.Count; $i++) {
    Write-Host "photo $i length: $($item.photos[$i].Length)"
}

foreach ($m in $meds) {
    if ($m.history) {
        Write-Host "History in $($m.name): $($m.history.Count) items"
        foreach ($h in $m.history) {
            Write-Host "  history photoUrl length: $(if ($h.photoUrl) { $h.photoUrl.Length } else { 0 })"
        }
    }
}
