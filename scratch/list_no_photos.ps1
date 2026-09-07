$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations

foreach ($m in $meds) {
    if (-not $m.photoUrl -or $m.photoUrl -eq "") {
        Write-Host "$($m.name) | id: $($m.id) | updated: $($m.updatedAt) | by: $($m.updatedBy)"
    }
}
