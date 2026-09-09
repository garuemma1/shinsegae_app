$targetFiles = @(
    'c:\Users\win10\Desktop\shinsegae_app\schedule-module.js',
    'c:\Users\win10\Desktop\shinsegae_app\Code.gs',
    'c:\Users\win10\Desktop\shinsegae_app\sheets-sync.js',
    'c:\Users\win10\Desktop\shinsegae_app\daily-briefing-widget.js'
)

foreach ($file in $targetFiles) {
    if (Test-Path $file) {
        $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
        $chars = $content.ToCharArray()
        $oc = 0; $cc = 0; $op = 0; $cp = 0
        foreach ($c in $chars) {
            if ($c -eq '{') { $oc++ }
            elseif ($c -eq '}') { $cc++ }
            elseif ($c -eq '(') { $op++ }
            elseif ($c -eq ')') { $cp++ }
        }
        $leaf = Split-Path $file -Leaf
        Write-Output "$leaf -> Curl: $oc / $cc (Diff: $($oc - $cc)), Paren: $op / $cp (Diff: $($op - $cp))"
    }
}
