Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile("C:\Users\win10\.gemini\antigravity\brain\0b69d325-6491-4f7c-8759-01a16a08ac7f\.user_uploaded\media_1788748454368.png")

# Top left dropdown with cloud name
$rectCloud = New-Object System.Drawing.Rectangle(870, 70, 200, 35)
$bmpCloud = New-Object System.Drawing.Bitmap(200, 35)
$g = [System.Drawing.Graphics]::FromImage($bmpCloud)
$g.DrawImage($img, 0, 0, $rectCloud, [System.Drawing.GraphicsUnit]::Pixel)
$bmpCloud.Save("c:\Users\win10\Desktop\shinsegae_app\scratch\crop_cloud2.png")

# Preset row (Name, Mode, etc.)
$rectPreset = New-Object System.Drawing.Rectangle(1140, 250, 400, 40)
$bmpPreset = New-Object System.Drawing.Bitmap(400, 40)
$g2 = [System.Drawing.Graphics]::FromImage($bmpPreset)
$g2.DrawImage($img, 0, 0, $rectPreset, [System.Drawing.GraphicsUnit]::Pixel)
$bmpPreset.Save("c:\Users\win10\Desktop\shinsegae_app\scratch\crop_preset2.png")

# Also the right side of preset row (three dots or edit button)
$rectActions = New-Object System.Drawing.Rectangle(1750, 240, 100, 50)
$bmpActions = New-Object System.Drawing.Bitmap(100, 50)
$g3 = [System.Drawing.Graphics]::FromImage($bmpActions)
$g3.DrawImage($img, 0, 0, $rectActions, [System.Drawing.GraphicsUnit]::Pixel)
$bmpActions.Save("c:\Users\win10\Desktop\shinsegae_app\scratch\crop_actions.png")

$img.Dispose()
Write-Host "Done"
