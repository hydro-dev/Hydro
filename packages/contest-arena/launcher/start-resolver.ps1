param(
    [string]$ResolverDir,
    [string]$JavaHome,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'

function Find-ResolverDirectory {
    param([string]$Requested)
    if ($Requested) {
        $Requested = [Environment]::ExpandEnvironmentVariables($Requested.Trim().Trim('"'))
        if (-not (Test-Path -LiteralPath (Join-Path $Requested 'lib/resolver.jar') -PathType Leaf)) {
            throw "找不到 Resolver：$Requested。请选择包含 lib 文件夹的解压目录。"
        }
        return (Resolve-Path -LiteralPath $Requested).Path
    }
    $folders = @((Join-Path $PSScriptRoot 'resolver'), (Join-Path $PSScriptRoot '../resolver'))
    $folders += @(Get-ChildItem -LiteralPath $PSScriptRoot -Directory -Filter 'resolver-*' | Sort-Object Name -Descending | ForEach-Object FullName)
    foreach ($folder in $folders) {
        if (Test-Path -LiteralPath (Join-Path $folder 'lib/resolver.jar') -PathType Leaf) {
            return (Resolve-Path -LiteralPath $folder).Path
        }
    }
    return Find-ResolverDirectory (Read-Host '请输入 ICPC Resolver 解压目录（包含 lib 文件夹）')
}

function Get-RequiredJavaVersion {
    param([string]$Directory)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead((Join-Path $Directory 'lib/resolver.jar'))
    try {
        $entry = $archive.GetEntry('org/icpc/tools/resolver/Resolver.class')
        if (-not $entry) { throw 'resolver.jar 中缺少 Resolver 主程序，请重新下载并完整解压。' }
        $reader = [IO.BinaryReader]::new($entry.Open())
        try { $header = $reader.ReadBytes(8) } finally { $reader.Dispose() }
        if ($header.Length -ne 8 -or [BitConverter]::ToString($header, 0, 4) -ne 'CA-FE-BA-BE') {
            throw 'Resolver 主程序格式不正确，请重新下载并完整解压。'
        }
        return [Math]::Max(17, $header[6] * 256 + $header[7] - 44)
    } finally { $archive.Dispose() }
}

function Get-JavaExecutable {
    param([string]$Directory)
    if (-not $Directory) { return }
    $Directory = [Environment]::ExpandEnvironmentVariables($Directory.Trim().Trim('"'))
    if ([IO.Path]::GetFileName($Directory) -ieq 'java.exe') { return $Directory }
    return Join-Path $Directory 'bin/java.exe'
}

function Get-JavaCandidates {
    $folders = @(
        (Join-Path $PSScriptRoot 'runtime'), (Join-Path $PSScriptRoot 'jre'), (Join-Path $PSScriptRoot 'jdk'),
        (Join-Path $ResolverDir 'jre'), (Join-Path $ResolverDir 'jdk'),
        $env:HGNU_JAVA_HOME, $env:JAVA_HOME, $env:JDK_HOME
    )
    foreach ($folder in $folders) { if ($folder) { Get-JavaExecutable $folder } }
    Get-Command java.exe -All -CommandType Application -ErrorAction SilentlyContinue | ForEach-Object Source
    $roots = @()
    if ($env:USERPROFILE) { $roots += Join-Path $env:USERPROFILE '.jdks' }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($base) {
            foreach ($vendor in @('Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'BellSoft', 'Amazon Corretto', 'Semeru')) {
                $roots += Join-Path $base $vendor
            }
        }
    }
    if ($env:LOCALAPPDATA) { $roots += Join-Path $env:LOCALAPPDATA 'Programs/Eclipse Adoptium' }
    foreach ($root in $roots) {
        if (Test-Path -LiteralPath $root -PathType Container) {
            Get-JavaExecutable $root
            Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending | ForEach-Object { Get-JavaExecutable $_.FullName }
        }
    }
}

function Read-JavaVersion {
    param([string]$Executable)
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return }
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
    $startInfo.Arguments = '-XshowSettings:properties -version'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(5000)) { $process.Kill(); return }
        $text = $stdout.Result + $stderr.Result
        $version = [regex]::Match($text, '(?m)^\s*java\.specification\.version\s*=\s*(\S+)')
        $bits = [regex]::Match($text, '(?m)^\s*sun\.arch\.data\.model\s*=\s*(\d+)')
        if ($process.ExitCode -ne 0 -or -not $version.Success) { return }
        $specification = $version.Groups[1].Value
        if ($specification.StartsWith('1.')) { $specification = $specification.Split('.')[1] }
        $major = 0
        if (-not [int]::TryParse($specification, [ref]$major)) { return }
        return [pscustomobject]@{ Path = $Executable; Version = $major; Bits = $bits.Groups[1].Value }
    } catch { return } finally { $process.Dispose() }
}

try {
    $ResolverDir = Find-ResolverDirectory $ResolverDir
    $minimum = Get-RequiredJavaVersion $ResolverDir
    $selected = $null
    $found = [Collections.Generic.List[string]]::new()
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $candidates = if ($JavaHome) { @(Get-JavaExecutable $JavaHome) } else { @(Get-JavaCandidates) }
    foreach ($candidate in $candidates) {
        if (-not $seen.Add($candidate)) { continue }
        $java = Read-JavaVersion $candidate
        if (-not $java) { continue }
        $found.Add("Java $($java.Version) ($($java.Bits)-bit): $($java.Path)")
        if ($java.Version -ge $minimum -and $java.Bits -eq '64') { $selected = $java; break }
    }
    if (-not $selected) {
        if ($found.Count) { Write-Host ($found -join [Environment]::NewLine) }
        throw "未找到可用的 64 位 Java $minimum 或更高版本。请安装兼容版本，或将解压版 JDK/JRE 放入本包的 runtime 文件夹；也可使用 -JavaHome 指定目录。Java 下载：https://adoptium.net/temurin/releases/"
    }
    $env:ICPC_FONT = 'Microsoft YaHei'
    Write-Host "Java $($selected.Version): $($selected.Path)"
    Write-Host "Resolver: $ResolverDir"
    $classpath = Join-Path $ResolverDir 'lib/*'
    Push-Location -LiteralPath $PSScriptRoot
    try {
        if ($Check) { & $selected.Path -cp $classpath org.icpc.tools.resolver.Resolver --version }
        else { & $selected.Path -Xmx1024m -cp $classpath org.icpc.tools.resolver.Resolver $PSScriptRoot }
        $resolverExit = $LASTEXITCODE
    } finally { Pop-Location }
    exit $resolverExit
} catch {
    Write-Host "启动失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
