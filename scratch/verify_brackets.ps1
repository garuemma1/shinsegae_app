function Check-Brackets($filePath) {
    $content = Get-Content -Raw -Encoding UTF8 $filePath
    $openCurl = [regex]::Matches($content, '\{').Count
    $closeCurl = [regex]::Matches($content, '\}').Count
    $openParen = [regex]::Matches($content, '\(').Count
    $closeParen = [regex]::Matches($content, '\)').Count
    $openBrack = [regex]::Matches($content, '\[').Count
    $closeBrack = [regex]::Matches($content, '\]').Count
    
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
    'c:\Users\win10\Desktop\shinsegae_app\schedule-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\building-rental-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\medicine-location-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\rx-medicine-location-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\pharmacy-exchange-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\patient-orders-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\daily-briefing-widget.js',
    'c:\Users\win10\Desktop\shinsegae_app\smart-ledger-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\Code.gs'
) | ForEach-Object { Check-Brackets $_ } | Format-Table -AutoSize
