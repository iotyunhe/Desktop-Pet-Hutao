# 在桌面创建一个「胡桃工作台」快捷方式
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\create-workbench-shortcut.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\create-workbench-shortcut.ps1 -Exe "E:\Game\Hutao\hutao-desktop-pet\胡桃桌宠.exe"
#
# 不带 -Exe 时，会按「安装版 → release\win-unpacked」的顺序自己找。

param(
    [string]$Exe,
    [string]$Name = '胡桃工作台'
)

$ErrorActionPreference = 'Stop'

function Find-PetExe {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\hutao-desktop-pet\胡桃桌宠.exe'),
        (Join-Path $env:ProgramFiles '胡桃桌宠\胡桃桌宠.exe'),
        (Join-Path $env:LOCALAPPDATA '胡桃桌宠\胡桃桌宠.exe')
    )

    $repoRoot = Split-Path -Parent $PSScriptRoot
    $candidates += (Join-Path $repoRoot 'release\win-unpacked\胡桃桌宠.exe')

    foreach ($path in $candidates) {
        if (Test-Path -LiteralPath $path) {
            return (Resolve-Path -LiteralPath $path).Path
        }
    }

    return $null
}

if (-not $Exe) {
    $Exe = Find-PetExe
}

if (-not $Exe -or -not (Test-Path -LiteralPath $Exe)) {
    throw '找不到胡桃桌宠的 exe，请用 -Exe 指定完整路径。'
}

$exePath = (Resolve-Path -LiteralPath $Exe).Path
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop "$Name.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
$shortcut.TargetPath = $exePath
$shortcut.Arguments = '--open-workbench'
$shortcut.WorkingDirectory = Split-Path -Parent $exePath
$shortcut.IconLocation = "$exePath,0"
$shortcut.Description = '打开胡桃工作台（只在本机运行）'
$shortcut.Save()

Write-Host "已创建快捷方式：$linkPath"
Write-Host "目标：$exePath --open-workbench"
