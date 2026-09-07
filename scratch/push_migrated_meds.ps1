$backup = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $backup.shinsegae_master_db.data.medicineLocations

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

Write-Host "Total items to upload: $($meds.Count), with photos: $updatedCount"
$jsonBody = $meds | ConvertTo-Json -Depth 10

# Upload to Firebase Realtime Database
$fbUrl = "https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/data/medicineLocations.json"
Write-Host "Uploading to $fbUrl..."
$res = Invoke-RestMethod -Uri $fbUrl -Method Put -Body ([System.Text.Encoding]::UTF8.GetBytes($jsonBody)) -ContentType "application/json; charset=utf-8"

Write-Host "Firebase Upload Response count: $($res.Count)"

# Send Push Signal
$sigUrl = "https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pushSignal.json"
$sigBody = @{
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    sender = "system_photo_migration"
    source = "medicineLocations"
    version = "5.0"
} | ConvertTo-Json

$sigRes = Invoke-RestMethod -Uri $sigUrl -Method Put -Body ([System.Text.Encoding]::UTF8.GetBytes($sigBody)) -ContentType "application/json; charset=utf-8"
Write-Host "Push signal sent: $($sigRes | ConvertTo-Json -Compress)"
