$mapJson = Get-Content "c:\Users\win10\Desktop\shinsegae_app\scratch\cloudinary_url_map.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$backup = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $backup.shinsegae_master_db.data.medicineLocations

$updatedCount = 0
foreach ($m in $meds) {
    $medId = $m.id -replace '[^a-zA-Z0-9_]', '_'
    if ($mapJson.PSObject.Properties[$medId]) {
        $cldUrl = $mapJson.$medId
        $m.photoUrl = $cldUrl
        if ($m.PSObject.Properties['photos']) {
            $m.photos = @($cldUrl)
        } else {
            $m | Add-Member -NotePropertyName 'photos' -NotePropertyValue @($cldUrl)
        }
        $updatedCount++
        Write-Host "Mapped $($m.name) -> $cldUrl"
    }
}

Write-Host "`nTotal items mapped to Cloudinary: $updatedCount / $($meds.Count)"

$jsonBody = $meds | ConvertTo-Json -Depth 10

# Upload to Firebase Realtime Database
$fbUrl = "https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/data/medicineLocations.json"
Write-Host "Uploading to Firebase: $fbUrl..."
$res = Invoke-RestMethod -Uri $fbUrl -Method Put -Body ([System.Text.Encoding]::UTF8.GetBytes($jsonBody)) -ContentType "application/json; charset=utf-8"

Write-Host "Firebase Upload Response count: $($res.Count)"

# Send Push Signal
$sigUrl = "https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pushSignal.json"
$sigBody = @{
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    sender = "system_cloudinary_migration"
    source = "medicineLocations"
    version = "5.0"
} | ConvertTo-Json

$sigRes = Invoke-RestMethod -Uri $sigUrl -Method Put -Body ([System.Text.Encoding]::UTF8.GetBytes($sigBody)) -ContentType "application/json; charset=utf-8"
Write-Host "Push signal sent: $($sigRes | ConvertTo-Json -Compress)"
