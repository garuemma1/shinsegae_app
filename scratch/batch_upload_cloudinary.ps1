$medPhotosDir = "c:\Users\win10\Desktop\shinsegae_app\assets\med_photos"
$files = Get-ChildItem -Path $medPhotosDir -Filter "*.jpg"

$cloudName = 'nl5hat8p'
$preset = 'hxyfannv'
$uploadUrl = "https://api.cloudinary.com/v1_1/$cloudName/image/upload"

$map = @{}
$successCount = 0

Write-Host "Uploading $($files.Count) photos to Cloudinary ($cloudName / $preset)..."

foreach ($f in $files) {
    $medId = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    try {
        # Upload via curl.exe to handle multipart cleanly
        $resJson = & curl.exe -s -X POST $uploadUrl -F "upload_preset=$preset" -F "file=@$($f.FullName)"
        $resObj = $resJson | ConvertFrom-Json
        if ($resObj.secure_url) {
            $map[$medId] = $resObj.secure_url
            $successCount++
            Write-Host "[$successCount/$($files.Count)] Uploaded $($f.Name) -> $($resObj.secure_url)"
        } else {
            Write-Host "FAILED $($f.Name): $resJson"
        }
    } catch {
        Write-Host "ERROR $($f.Name): $($_.Exception.Message)"
    }
}

Write-Host "`nSuccessfully uploaded: $successCount / $($files.Count)"
$map | ConvertTo-Json | Set-Content "c:\Users\win10\Desktop\shinsegae_app\scratch\cloudinary_url_map.json" -Encoding UTF8
