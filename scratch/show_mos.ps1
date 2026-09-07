$b = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw | ConvertFrom-Json
$meds = $b.shinsegae_master_db.data.medicineLocations
$m = $meds | Where-Object { $_.id -eq 'med_1787961929934' }
$m | ConvertTo-Json -Depth 5
