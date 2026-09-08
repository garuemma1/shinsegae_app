function Check-Brackets($filePath) {
    $content = Get-Content -Raw -Encoding UTF8 $filePath
    $openCurl = ($content.ToCharArray() | Where-Object { $_ -eq '{' }).Count
    $closeCurl = ($content.ToCharArray() | Where-Object { $_ -eq '}' }).Count
    $openParen = ($content.ToCharArray() | Where-Object { $_ -eq '(' }).Count
    $closeParen = ($content.ToCharArray() | Where-Object { $_ -eq ')' }).Count
    $openBrack = ($content.ToCharArray() | Where-Object { $_ -eq '[' }).Count
    $closeBrack = ($content.ToCharArray() | Where-Object { $_ -eq ']' }).Count
    
    [PSCustomObject]@{
        File = Split-Path $filePath -Leaf
        OpenCurl = $openCurl
        CloseCurl = $closeCurl
        CurlDiff = $openCurl - $closeCurl
        OpenParen = $openParen
        CloseParen = $closeParen
        ParenDiff = $openParen - $closeParen
        OpenBrack = $openBrack
        CloseBrack = $closeBrack
        BrackDiff = $openBrack - $closeBrack
    }
}

@(
    'c:\Users\win10\Desktop\shinsegae_app\app.js',
    'c:\Users\win10\Desktop\shinsegae_app\expiry-returns-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\staff-directory-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\sheets-sync.js',
    'c:\Users\win10\Desktop\shinsegae_app\building-rental-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\medicine-location-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\smart-ledger-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\Code.gs'
) | ForEach-Object { Check-Brackets $_ } | Format-Table -AutoSize
