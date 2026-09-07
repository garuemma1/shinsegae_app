Add-Type -AssemblyName System.Drawing

$outDir = "c:\Users\win10\Desktop\shinsegae_app\assets\med_photos"
$files = Get-ChildItem -Path $outDir -Filter "*.jpg"

Write-Host "Verifying $($files.Count) images..."
$success = 0
foreach ($f in $files) {
    try {
        $img = [System.Drawing.Image]::FromFile($f.FullName)
        $w = $img.Width
        $h = $img.Height
        $img.Dispose()
        Write-Host "OK: $($f.Name) (${w}x${h}, $([Math]::Round($f.Length/1024, 1)) KB)"
        $success++
    } catch {
        Write-Host "FAIL: $($f.Name) - $($_.Exception.Message)"
    }
}
Write-Host "Total verified valid images: $success / $($files.Count)"
