$res = Invoke-RestMethod -Uri 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/.json' -Method Get
$raw = $res | ConvertTo-Json -Depth 10 -Compress
$totalBytes = [System.Text.Encoding]::UTF8.GetByteCount($raw)
Write-Host "=========================================="
Write-Host "🔥 Firebase 전체 클라우드 DB 총 용량: $([Math]::Round($totalBytes / 1024, 2)) KB ($([Math]::Round($totalBytes / 1024 / 1024, 3)) MB)"
Write-Host "=========================================="

$dataObj = $res.shinsegae_master_db.data
$subKeys = $dataObj.psobject.Properties | Select-Object -ExpandProperty Name
$results = @()
foreach ($k in $subKeys) {
    $kJson = $dataObj.$k | ConvertTo-Json -Depth 10 -Compress
    $kBytes = [System.Text.Encoding]::UTF8.GetByteCount($kJson)
    $results += [PSCustomObject]@{
        ModuleKey = $k
        SizeBytes = $kBytes
        SizeKB = [Math]::Round($kBytes / 1024, 2)
        Percentage = [Math]::Round(($kBytes / $totalBytes) * 100, 1)
    }
}

$results | Sort-Object -Property SizeBytes -Descending | Format-Table -AutoSize

$cMatches = [regex]::Matches($raw, 'https://res\.cloudinary\.com[^"]+')
$urls = @($cMatches | ForEach-Object { $_.Value } | Select-Object -Unique)
Write-Host "Cloudinary Total Photos Count: $($urls.Count)"


