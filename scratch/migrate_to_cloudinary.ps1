$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "1. Firebase data loading & backup"
Write-Host "=========================================="

$firebaseUrl = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/.json'
$res = Invoke-RestMethod -Uri $firebaseUrl -Method Get

$backupPath = "c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json"
$backupJson = $res | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($backupPath, $backupJson, [System.Text.Encoding]::UTF8)
Write-Host "Backup created: $backupPath"

$cloudName = 'n9hlellu'
$uploadPreset = 'ivyyfanrv'
$cloudinaryUrl = "https://api.cloudinary.com/v1_1/$cloudName/image/upload"

$meds = $res.shinsegae_master_db.data.medicineLocations
$migratedCount = 0
$failCount = 0

Write-Host "=========================================="
Write-Host "2. Migrating Base64 photos to Cloudinary"
Write-Host "=========================================="

for ($i = 0; $i -lt $meds.Count; $i++) {
    $m = $meds[$i]
    if ($m.photoUrl -and $m.photoUrl.StartsWith('data:image')) {
        $b64 = $m.photoUrl
        $name = $m.name
        $kb = [Math]::Round($b64.Length / 1024, 1)
        Write-Host "[$i/$($meds.Count)] Uploading $name ($kb KB)..."

        try {
            $body = @{
                file = $b64
                upload_preset = $uploadPreset
            }
            $cRes = Invoke-RestMethod -Uri $cloudinaryUrl -Method Post -Body $body
            if ($cRes -and $cRes.secure_url) {
                $m.photoUrl = $cRes.secure_url
                $m.photos = @($cRes.secure_url)
                $m.updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                $migratedCount++
                Write-Host "  SUCCESS -> $($cRes.secure_url)"
            } else {
                Write-Host "  NO SECURE_URL"
                $failCount++
            }
        } catch {
            Write-Host "  FAILED: $($_.Exception.Message)"
            $failCount++
        }

        Start-Sleep -Milliseconds 200
    }
}

Write-Host "=========================================="
Write-Host "Result: Success $migratedCount / Fail $failCount"
Write-Host "=========================================="

if ($migratedCount -gt 0) {
    Write-Host "3. Updating Firebase Realtime Database..."
    $updateUrl = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/data/medicineLocations.json'
    $jsonPayload = $meds | ConvertTo-Json -Depth 10
    $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonPayload)

    $putRes = Invoke-RestMethod -Uri $updateUrl -Method Put -Body $payloadBytes -ContentType 'application/json; charset=utf-8'
    Write-Host "Firebase medicineLocations updated successfully!"

    $sigUrl = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pushSignal.json'
    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $sigObj = @{
        timestamp = "$($nowMs)_med_migrated"
        senderId = "system_migration"
        senderName = "System"
        body = "Medicine location photos migrated to Cloudinary successfully."
    }
    $sigBytes = [System.Text.Encoding]::UTF8.GetBytes(($sigObj | ConvertTo-Json))
    Invoke-RestMethod -Uri $sigUrl -Method Put -Body $sigBytes -ContentType 'application/json; charset=utf-8'
    Write-Host "Push signal broadcasted!"
}
