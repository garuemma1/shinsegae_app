Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient

$clouds = @(
    'nl5hatllp', 'nl5hatiip', 'nl5hatlip', 'nl5hatilp', 'nl5hat11p', 'nl5hat1lp', 'nl5hatl1p',
    'nl5hat8p', 'nl5hatll8', 'nl5hatlp', 'nl5hatll'
)

$presets = @(
    'txxyfanrv', 'tvxyfanrv', 'txyfanrv', 'ivxyfanrv', 'ixxyfanrv', 'ivyyfanrv',
    'txxfanrv', 'tvxfanrv', 'txfanrv', 'txyfannv', 'txxyfannv', 'tvxyfannv'
)

$base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

foreach ($c in $clouds) {
    foreach ($p in $presets) {
        $content = New-Object System.Net.Http.MultipartFormDataContent
        $content.Add((New-Object System.Net.Http.StringContent($p)), 'upload_preset')
        $content.Add((New-Object System.Net.Http.StringContent($base64)), 'file')
        
        try {
            $resp = $client.PostAsync("https://api.cloudinary.com/v1_1/$c/image/upload", $content).Result
            $body = $resp.Content.ReadAsStringAsync().Result
            if ($resp.IsSuccessStatusCode) {
                Write-Host ">>> FOUND SUCCESS! Cloud: $c | Preset: $p <<<"
                Write-Host "URL: $body"
                exit 0
            } else {
                # Write-Host "Failed: $c / $p -> $($resp.StatusCode)"
            }
        } catch {
        }
    }
}
Write-Host "All combinations tested."
