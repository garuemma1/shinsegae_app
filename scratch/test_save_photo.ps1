$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations

$first = $meds | Where-Object { $_.photoUrl -and $_.photoUrl.StartsWith('data:image') } | Select-Object -First 1
Write-Host "Item: $($first.name)"

$base64 = $first.photoUrl -replace '^data:image/\w+;base64,', ''
$bytes = [Convert]::FromBase64String($base64)

$outDir = "c:\Users\win10\Desktop\shinsegae_app\assets\med_photos"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$outPath = Join-Path $outDir "test_photo.jpg"
[IO.File]::WriteAllBytes($outPath, $bytes)
Write-Host "Saved to $outPath, Size: $($bytes.Length) bytes"
