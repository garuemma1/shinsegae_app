Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$content = New-Object System.Net.Http.MultipartFormDataContent
$content.Add((New-Object System.Net.Http.StringContent('ivyyfanrv')), 'upload_preset')
$content.Add((New-Object System.Net.Http.StringContent('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')), 'file')

$resp = $client.PostAsync('https://api.cloudinary.com/v1_1/n9hlellu/image/upload', $content).Result

Write-Host "Status Code: $($resp.StatusCode)"
foreach ($h in $resp.Headers) {
    Write-Host "$($h.Key): $($h.Value)"
}
Write-Host "Body: $($resp.Content.ReadAsStringAsync().Result)"
