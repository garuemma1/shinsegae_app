Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient

$cloudName = 'nl5hat8p'
$preset = 'hxyfannv'
$base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

$content = New-Object System.Net.Http.MultipartFormDataContent
$content.Add((New-Object System.Net.Http.StringContent($preset)), 'upload_preset')
$content.Add((New-Object System.Net.Http.StringContent($base64)), 'file')

try {
    $resp = $client.PostAsync("https://api.cloudinary.com/v1_1/$cloudName/image/upload", $content).Result
    $body = $resp.Content.ReadAsStringAsync().Result
    Write-Host "StatusCode: $($resp.StatusCode)"
    Write-Host "Body: $body"
} catch {
    Write-Host "Exception: $($_.Exception.Message)"
}
