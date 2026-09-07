$res = Invoke-RestMethod -Uri 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/.json' -Method Get
$meds = $res.shinsegae_master_db.data.medicineLocations

foreach ($m in $meds) {
    $hasPhoto = if ($m.photoUrl -and $m.photoUrl.Length -gt 10) { "HAS_PHOTO ($($m.photoUrl.Length) chars)" } else { "NO_PHOTO" }
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Host "$($m.id) | $($m.updatedAt) | $($hasPhoto) | $($m.name)"
}
