# Libera portas do Gestão de Plantões em modo paralelo ao Hospital BI.
param(
    [int[]]$Ports = @(3000, 5180)
)

foreach ($port in $Ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $procId = $c.OwningProcess
        if (-not $procId) { continue }
        try {
            $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($p) {
                Write-Host "  Porta $port : encerrando PID $procId ($($p.ProcessName))" -ForegroundColor Yellow
                Stop-Process -Id $procId -Force -ErrorAction Stop
            }
        } catch { }
    }
}
