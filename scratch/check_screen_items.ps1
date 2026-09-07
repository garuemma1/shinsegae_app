$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations

$targets = @('모스세이프가드액', '탈지면세디', '샌코프액', '마그라민', '콜리덤', '트로겐', '관장약', '용각산', '엑티젯')

foreach ($t in $targets) {
    $found = $meds | Where-Object { $_.name -like "*$t*" }
    if ($found) {
        Write-Host "$($found.name) (ID: $($found.id), created: $($found.createdAt), updated: $($found.updatedAt))"
        Write-Host "  photoUrl: '$($found.photoUrl)'"
        Write-Host "  photos: '$($found.photos)'"
    } else {
        Write-Host "$t : NOT FOUND"
    }
}
