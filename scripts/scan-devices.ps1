param(
  [string]$Output = ''
)

$ErrorActionPreference = 'SilentlyContinue'
if ([string]::IsNullOrEmpty($Output)) {
  $Output = Join-Path $PSScriptRoot '..\..\temp\pnp-raw.json'
}

$classes = @('HIDClass', 'Keyboard', 'Mouse', 'USB', 'Bluetooth', 'Monitor', 'Camera', 'Image', 'AudioEndpoint', 'MEDIA')
$keys = @(
  'DEVPKEY_Device_Parent',
  'DEVPKEY_Device_LocationInfo',
  'DEVPKEY_Device_LocationPaths',
  'DEVPKEY_Device_BusReportedDeviceDesc',
  'DEVPKEY_Device_Manufacturer',
  'DEVPKEY_Device_FriendlyName',
  'DEVPKEY_Device_SerialNumber',
  'DEVPKEY_Device_DriverDesc'
)

$devices = @(Get-PnpDevice -PresentOnly | Where-Object { $classes -contains $_.Class })
$rawProps = @($devices | Get-PnpDeviceProperty | Where-Object { $keys -contains $_.KeyName })

$propsByInstance = @{}
foreach ($prop in $rawProps) {
  $instanceId = [string]$prop.InstanceId
  if (-not $propsByInstance.ContainsKey($instanceId)) {
    $propsByInstance[$instanceId] = @{}
  }
  $value = $prop.Data
  if ($value -is [System.Array]) {
    $value = (@($value | ForEach-Object { [string]$_ }) -join ' | ')
  }
  $propsByInstance[$instanceId][[string]$prop.KeyName] = [string]$value
}

$result = foreach ($device in $devices) {
  $instanceId = [string]$device.InstanceId
  $props = $propsByInstance[$instanceId]
  if ($null -eq $props) { $props = @{} }
  [pscustomobject]@{
    class        = [string]$device.Class
    name         = [string]$device.FriendlyName
    instanceId   = $instanceId
    status       = [string]$device.Status
    manufacturer = [string]$device.Manufacturer
    busDesc      = $props['DEVPKEY_Device_BusReportedDeviceDesc']
    parent       = $props['DEVPKEY_Device_Parent']
    location     = $props['DEVPKEY_Device_LocationInfo']
    paths        = $props['DEVPKEY_Device_LocationPaths']
    driver       = $props['DEVPKEY_Device_DriverDesc']
  }
}

$json = ConvertTo-Json -InputObject @($result) -Depth 4 -Compress
[System.IO.File]::WriteAllText($Output, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output $Output
