$files = Get-ChildItem 'c:\Users\win10\Desktop\shinsegae_app\assets\med_photos' -Filter '*.jpg'
$sum = 0
foreach ($f in $files) {
    $sum += $f.Length
}

$kb = [Math]::Round($sum / 1024, 2)
$mb = [Math]::Round($sum / 1024 / 1024, 3)
$gb = [Math]::Round($sum / 1024 / 1024 / 1024, 6)

$limitGB = 25.0
$limitMB = 25.0 * 1024
$usedPercent = [Math]::Round(($mb / $limitMB) * 100, 4)
$remainingGB = [Math]::Round($limitGB - ($sum / 1024 / 1024 / 1024), 3)

Write-Host "Files Count: $($files.Count)"
Write-Host "Total Bytes: $sum"
Write-Host "Total Size: $kb KB ($mb MB)"
Write-Host "Cloudinary Free Tier Limit: 25 GB ($([Math]::Round($limitMB, 0)) MB)"
Write-Host "Usage Percentage: $usedPercent %"
Write-Host "Remaining Space: $remainingGB GB"
