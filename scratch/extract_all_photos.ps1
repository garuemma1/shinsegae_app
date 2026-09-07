$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations

$outDir = "c:\Users\win10\Desktop\shinsegae_app\assets\med_photos"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$migratedCount = 0
foreach ($m in $meds) {
    if ($m.photoUrl -and $m.photoUrl.StartsWith('data:image')) {
        $safeId = $m.id -replace '[^a-zA-Z0-9_]', '_'
        $fileName = "$safeId.jpg"
        $filePath = Join-Path $outDir $fileName
        
        $base64 = $m.photoUrl -replace '^data:image/\w+;base64,', ''
        $bytes = [Convert]::FromBase64String($base64)
        [IO.File]::WriteAllBytes($filePath, $bytes)
        
        $relPath = "assets/med_photos/$fileName"
        Write-Host "[$($m.name)] -> $relPath ($($bytes.Length) bytes)"
        $migratedCount++
    }
}
Write-Host "Total extracted and saved: $migratedCount photos"
