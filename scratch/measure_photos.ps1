$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations
$total = 0
foreach ($m in $meds) {
    if ($m.photoUrl) {
        $len = $m.photoUrl.Length
        $total += $len
        Write-Host "$($m.name) : $([Math]::Round($len/1024, 1)) KB"
    }
}
Write-Host "Total Base64 Size: $([Math]::Round($total/1024/1024, 2)) MB"
