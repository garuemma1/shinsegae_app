Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\Users\win10\.gemini\antigravity\brain\0b69d325-6491-4f7c-8759-01a16a08ac7f\.user_uploaded\media_1788748454368.png")
Write-Host "Width: $($img.Width), Height: $($img.Height)"
$img.Dispose()
