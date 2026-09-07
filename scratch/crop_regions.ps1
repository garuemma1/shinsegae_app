Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile("C:\Users\win10\.gemini\antigravity\brain\0b69d325-6491-4f7c-8759-01a16a08ac7f\.user_uploaded\media_1788748454368.png")

# Crop cloud name area (top-left of right window, around x=470..550, y=70..100 in 1920x1080)
$rectCloud = New-Object System.Drawing.Rectangle(900, 70, 200, 40)
$bmpCloud = New-Object System.Drawing.Bitmap(200, 40)
$g = [System.Drawing.Graphics]::FromImage($bmpCloud)
$g.DrawImage($img, 0, 0, $rectCloud, [System.Drawing.GraphicsUnit]::Pixel)
$bmpCloud.Save("c:\Users\win10\Desktop\shinsegae_app\scratch\crop_cloud.png")

# Crop preset name area (around x=1100..1300, y=200..300)
$rectPreset = New-Object System.Drawing.Rectangle(1100, 220, 250, 60)
$bmpPreset = New-Object System.Drawing.Bitmap(250, 60)
$g2 = [System.Drawing.Graphics]::FromImage($bmpPreset)
$g2.DrawImage($img, 0, 0, $rectPreset, [System.Drawing.GraphicsUnit]::Pixel)
$bmpPreset.Save("c:\Users\win10\Desktop\shinsegae_app\scratch\crop_preset.png")

$img.Dispose()
Write-Host "Cropped successfully!"
