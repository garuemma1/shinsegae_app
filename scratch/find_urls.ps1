$txt = Get-Content 'c:\Users\win10\Desktop\shinsegae_app\scratch\backup_before_cloudinary_migration.json' -Raw
$idx = $txt.IndexOf('drive.google.com')
Write-Host $txt.Substring([Math]::Max(0, $idx - 200), 400)
