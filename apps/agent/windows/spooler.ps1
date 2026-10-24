# Read-only spooler bridge. Parameters contain data, never executable expressions.
param([ValidateSet('printers','jobs','renderer')][string]$Operation, [string]$PrinterName, [string]$RendererPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  if ($Operation -eq 'renderer') {
    $v = (Get-Item -LiteralPath $RendererPath).VersionInfo
    @{ major = [int]$v.FileMajorPart; minor = [int]$v.FileMinorPart } | ConvertTo-Json -Compress
    exit 0
  }
  if ($Operation -eq 'jobs') {
    $items = @(Get-PrintJob -PrinterName $PrinterName -ErrorAction Stop | ForEach-Object {
      @{ id = [int]$_.ID; document = [string]$_.DocumentName; status = [int]$_.JobStatus }
    })
  } else {
    Add-Type -AssemblyName System.Drawing
    $items = @(Get-CimInstance Win32_Printer | ForEach-Object {
      $p = $_
      $color = $false; $duplex = $false; $maxCopies = 0; $papers = @(); $valid = $false
      try {
        $settings = New-Object System.Drawing.Printing.PrinterSettings
        $settings.PrinterName = $p.Name
        $valid = $settings.IsValid
        if ($valid) {
          $color = $settings.SupportsColor; $duplex = $settings.CanDuplex
          $maxCopies = [int]$settings.MaximumCopies
          $papers = @($settings.PaperSizes | ForEach-Object { [int]$_.RawKind })
        }
      } catch { # Preserve discoverability, with no advertised capabilities.
        $valid = $false
      }
      $identity = [string]$p.Name + "`n" + [string]$p.DriverName + "`n" + [string]$p.PortName
      $sha = [System.Security.Cryptography.SHA256]::Create()
      try { $identifier = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity)))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
      $available = $null
      if ($p.WorkOffline -or $p.PrinterStatus -in @(6,7) -or $p.DetectedErrorState -in @(3,4,5,6,7,8,9,10,11)) { $available = $false }
      elseif ($valid -and $p.PrinterStatus -in @(3,4) -and $p.DetectedErrorState -eq 2) { $available = $true }
      @{ name = [string]$p.Name; identifier = $identifier; isDefault = [bool]$p.Default; available = $available;
         color = [bool]$color; duplex = [bool]$duplex; maxCopies = $maxCopies; papers = $papers }
    })
  }
  ConvertTo-Json -InputObject $items -Depth 5 -Compress
} catch { [Console]::Error.WriteLine('WINDOWS_SPOOLER_QUERY_FAILED'); exit 1 }
