Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\Users\win10\.gemini\antigravity\brain\0b69d325-6491-4f7c-8759-01a16a08ac7f\.user_uploaded\media_1788748454368.png")

# 1. Cloud Name area in top-left of the Cloudinary dashboard
$rectCloud = New-Object System.Drawing.Rectangle(470, 38, 120, 25)
$bmpCloud = New-Object System.Drawing.Bitmap(120, 25)
$g = [System.Drawing.Graphics]::FromImage($bmpCloud)
$g.DrawImage($img, 0, 0, $rectCloud, [System.Drawing.GraphicsUnit]::Pixel)
$bmpCloud.Save("c:\Users\win10\Desktop\shinsegae_app\scratch\cloud_name_real.png")

# 2. Preset row in table
$rectPreset = New-Object System.Drawing.Rectangle(590, 140, 380, 50)
$bmpPreset = New-Object System.Drawing.Bitmap(380, 50)
$g2 = [System.Drawing.Graphics]::FromImage($bmpPreset)
$g2.DrawImage($img, 0, 0, $rectPreset, [System.Drawing.GraphicsUnit]::Pixel)
$bmpPreset.Save("c:\Users\win10\Desktop\shinsegae_app\scratch\preset_row_real.png")

$img.Dispose()
Write-Host "Real crops done!"
