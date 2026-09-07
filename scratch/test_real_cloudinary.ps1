Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$content = New-Object System.Net.Http.MultipartFormDataContent
$content.Add((New-Object System.Net.Http.StringContent('txyifanrv')), 'upload_preset')
$content.Add((New-Object System.Net.Http.StringContent('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')), 'file')

$resp = $client.PostAsync('https://api.cloudinary.com/v1_1/nl5hatiip/image/upload', $content).Result
Write-Host "Status: $($resp.StatusCode)"
Write-Host "Response: $($resp.Content.ReadAsStringAsync().Result)"
