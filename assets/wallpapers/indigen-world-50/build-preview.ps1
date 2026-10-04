Add-Type -AssemblyName System.Drawing
$wallpaperRoot = $PSScriptRoot
$wallpaperFiles = @(Get-ChildItem -LiteralPath $wallpaperRoot -Filter '*.png' | Where-Object { $_.Name -match '^\d{2}-' } | Sort-Object Name)
$sheet = New-Object System.Drawing.Bitmap(1600, 2000)
$canvas = [System.Drawing.Graphics]::FromImage($sheet)
$canvas.Clear([System.Drawing.Color]::FromArgb(16,28,54))
$canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$font = New-Object System.Drawing.Font('Segoe UI', 9)
for ($i = 0; $i -lt $wallpaperFiles.Count; $i++) {
  $x = ($i % 5) * 320
  $y = [Math]::Floor($i / 5) * 200
  $source = [System.Drawing.Image]::FromFile($wallpaperFiles[$i].FullName)
  $canvas.DrawImage($source, [int]($x+6), [int]($y+4), 308, 173)
  $canvas.DrawString($wallpaperFiles[$i].BaseName, $font, [System.Drawing.Brushes]::White, [single]($x+6), [single]($y+180))
  $source.Dispose()
}
$sheet.Save((Join-Path $wallpaperRoot 'contact-sheet.jpg'), [System.Drawing.Imaging.ImageFormat]::Jpeg)
$font.Dispose()
$canvas.Dispose()
$sheet.Dispose()

