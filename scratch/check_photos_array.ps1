$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations

foreach ($m in $meds) {
    if ($m.photoUrl -and $m.photoUrl.StartsWith('data:image')) {
        $hasPhotos = ($null -ne $m.photos) -and ($m.photos.Count -gt 0)
        $hasHist = ($null -ne $m.history) -and ($m.history.Count -gt 0)
        Write-Host "$($m.name) | photos array: $hasPhotos ($($m.photos.Count)) | history: $hasHist"
    }
}
