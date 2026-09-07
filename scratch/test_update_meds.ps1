$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations

$updatedCount = 0
foreach ($m in $meds) {
    if ($m.photoUrl -and $m.photoUrl.StartsWith('data:image')) {
        $safeId = $m.id -replace '[^a-zA-Z0-9_]', '_'
        $relPath = "assets/med_photos/$safeId.jpg"
        $m.photoUrl = $relPath
        if ($m.PSObject.Properties['photos']) {
            $m.photos = @($relPath)
        } else {
            $m | Add-Member -NotePropertyName 'photos' -NotePropertyValue @($relPath)
        }
        $updatedCount++
    }
}

$afterJson = $meds | ConvertTo-Json -Depth 10
Write-Host "Success without errors!"
Write-Host "Total Items: $($meds.Count)"
Write-Host "Updated Items with Photos: $updatedCount"
Write-Host "Final JSON Size: $([Math]::Round($afterJson.Length/1024, 1)) KB"
