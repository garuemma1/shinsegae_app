$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations

Write-Host "=== Items WITH photos (27 items) ==="
foreach ($m in $meds) {
    if ($m.photoUrl -and $m.photoUrl.Length -gt 0) {
        Write-Host "$($m.name) | id: $($m.id) | updated: $($m.updatedAt) | by: $($m.updatedBy)"
    }
}
