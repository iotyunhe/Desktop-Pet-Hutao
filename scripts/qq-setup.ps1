<#
.SYNOPSIS
  把胡桃桌宠接进 SnowLuma（OneBot 11 协议端）。

.DESCRIPTION
  生成一个 token，写进 SnowLuma 的 config\onebot_<小号QQ>.json 的
  network.websocketClients（name = hutao），让协议端把群消息反向推到
  胡桃的 OneBot 服务端（默认 ws://127.0.0.1:6700/ws）。

  只改动 name = "hutao" 那一条，其它配置原样保留；写之前会备份 .bak。
  Windows PowerShell 5.1 与 PowerShell 7 都能跑。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\qq-setup.ps1 -Uin 123456789 -SnowLumaDir 'D:\SnowLuma'

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\qq-setup.ps1 -Uin 123456789 -Port 6701
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Uin,

  [int]$Port = 6700,

  [string]$Token = '',

  [string]$SnowLumaDir = '',

  [string]$HostName = '127.0.0.1'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Note([string]$Text) { Write-Host "！ $Text" -ForegroundColor Yellow }

function Test-HasProperty($Object, [string]$Name) {
  if ($null -eq $Object) { return $false }
  return @($Object.PSObject.Properties.Name) -contains $Name
}

# ---- 1. 参数校验 -----------------------------------------------------------
$Uin = ($Uin -replace '\D', '')
if ($Uin.Length -lt 5 -or $Uin.Length -gt 12) {
  throw "小号 QQ 看起来不对：'$Uin'（应为 5-12 位数字）"
}
if ($Port -lt 1024 -or $Port -gt 65535) {
  throw "端口 $Port 超出范围（1024-65535）"
}

# ---- 2. 找 SnowLuma 目录 ---------------------------------------------------
$candidates = @()
if ($SnowLumaDir) {
  $candidates += $SnowLumaDir
}
else {
  $candidates += @(
    (Join-Path (Get-Location) 'SnowLuma'),
    'D:\SnowLuma',
    'C:\SnowLuma',
    (Join-Path $env:USERPROFILE 'SnowLuma'),
    (Join-Path $env:USERPROFILE 'Desktop\SnowLuma')
  )
}

$root = $null
foreach ($candidate in $candidates) {
  if ($candidate -and (Test-Path -LiteralPath $candidate)) {
    $root = (Resolve-Path -LiteralPath $candidate).Path
    break
  }
}

if (-not $root) {
  Write-Note "没找到 SnowLuma 目录（找过：$($candidates -join ', ')）"
  Write-Host ""
  Write-Host "请用 -SnowLumaDir 指定解压目录，例如："
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\qq-setup.ps1 -Uin $Uin -SnowLumaDir 'D:\SnowLuma'"
  Write-Host ""
  Write-Host "如果还没装 SnowLuma：到 https://github.com/SnowLuma/SnowLuma 下载"
  Write-Host "SnowLuma-v*-win-x64.zip 解压，先启动 SnowLuma，再用桌面 QQ 登录小号。"
  exit 1
}

$configDir = Join-Path $root 'config'
if (-not (Test-Path -LiteralPath $configDir)) {
  throw "目录里没有 config\：$configDir（确认是 SnowLuma 根目录，里面有 SnowLuma.exe）"
}

# ---- 3. token --------------------------------------------------------------
if (-not $Token) {
  $bytes = New-Object 'byte[]' 16
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $Token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

# ---- 4. 读写配置 -----------------------------------------------------------
$configPath = Join-Path $configDir "onebot_$Uin.json"
$hadConfig = Test-Path -LiteralPath $configPath

if ($hadConfig) {
  Write-Step "读取 $configPath"
  $raw = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
  try {
    $config = $raw | ConvertFrom-Json
  }
  catch {
    throw "配置不是合法 JSON：$configPath"
  }
  Copy-Item -LiteralPath $configPath -Destination "$configPath.bak" -Force
  Write-Step '已备份原配置到 .bak'
}
else {
  Write-Note "还没有 config\onebot_$Uin.json（通常在小号登录 SnowLuma 后自动生成），将新建一份最小配置"
  $config = New-Object psobject
}

if (-not (Test-HasProperty $config 'network') -or $null -eq $config.network) {
  $config | Add-Member -NotePropertyName network -NotePropertyValue (New-Object psobject) -Force
}
if (-not (Test-HasProperty $config.network 'websocketClients')) {
  $config.network | Add-Member -NotePropertyName websocketClients -NotePropertyValue @() -Force
}

$entry = [pscustomobject][ordered]@{
  name              = 'hutao'
  enable            = $true
  url               = "ws://${HostName}:$Port/ws"
  messagePostFormat = 'array'
  reportSelfMessage = $false
  reconnectInterval = 1000
  token             = $Token
  debug             = $false
  heartInterval     = 1000
}

$clients = @($config.network.websocketClients) | Where-Object { $null -ne $_ }
$kept = @(
  $clients | Where-Object {
    $isHutao = (Test-HasProperty $_ 'name') -and ($_.name -eq 'hutao')
    $sameUrl = (Test-HasProperty $_ 'url') -and ($_.url -eq $entry.url)
    -not ($isHutao -or $sameUrl)
  }
)

$config.network.websocketClients = @($kept + $entry)

$json = $config | ConvertTo-Json -Depth 20
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, $json, $utf8NoBom)

Write-Step "写入 $configPath"

# ---- 5. 给用户下一步 -------------------------------------------------------
Write-Host ""
Write-Host '────────────────────────────────────────────'
Write-Host '接下来三件事：'
Write-Host ''
Write-Host '1) 重启 SnowLuma（不需要退出桌面 QQ）：'
Write-Host '   先关掉 SnowLuma 窗口，再双击 SnowLuma.exe。'
Write-Host ''
Write-Host '2) 打开胡桃面板 → QQ 标签，填：'
Write-Host ''
Write-Host "     端口        $Port"
Write-Host "     小号 QQ     $Uin"
Write-Host "     token       $Token"
Write-Host "     监听地址    ws://${HostName}:$Port/ws"
Write-Host ''
Write-Host '   然后点「连接」，状态应变成「已连接」。'
Write-Host ''
Write-Host '3) 点「刷新群列表」，把要说话的群加进白名单，'
Write-Host '   再按需调整「叫名字回 / 主动插话 / 冷却 / 10 分钟上限」。'
Write-Host ''
Write-Host '提示：'
Write-Host '  - 两边的 token 必须完全一致，否则一直显示未连接。'
Write-Host '  - 只在小号上用，第三方协议端有封号风险。'
Write-Host '  - 端口冲突时换一个（例如 -Port 6701），再把 SnowLuma 配置里的 url 同步改掉。'
Write-Host '────────────────────────────────────────────'

if (-not $hadConfig) {
  Write-Note '本次是新建配置：小号首次登录后 SnowLuma 可能用默认值补全该文件，记得再跑一次本脚本确认 name=hutao 那条还在。'
}
