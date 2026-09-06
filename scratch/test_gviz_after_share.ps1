try {
    $url = 'https://docs.google.com/spreadsheets/d/1glbM8sF0h0Horjs4QBp2Ap13VzlvkI0MHpz_YbTbzdA/gviz/tq?sheet=2609&tqx=out:json'
    $raw = Invoke-WebRequest -Uri $url -Method Get
    Write-Host "StatusCode: $($raw.StatusCode)"
    Write-Host "Response length: $($raw.Content.Length)"
    Write-Host "Sample snippet: $($raw.Content.Substring(0, [Math]::Min(200, $raw.Content.Length)))"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
