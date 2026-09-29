import { spawnSync } from 'node:child_process';

console.log('Passport listeners on ports 5173 and 3001. This command only reports processes.');

if (process.platform === 'win32') {
  const script = `
    $ErrorActionPreference = 'Stop'
    $listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5173, 3001 })
    @($listeners | ForEach-Object {
      $owner = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      [pscustomobject]@{ Port = $_.LocalPort; PID = $_.OwningProcess; Process = $owner.ProcessName; Address = $_.LocalAddress }
    }) | ConvertTo-Json -Compress
  `;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
    },
  );
  if (result.error || result.status !== 0) {
    console.error('Could not read the listening processes. Try this command in PowerShell:');
    console.error(
      'Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5173, 3001 } | Select-Object LocalPort, OwningProcess',
    );
    console.error(result.error?.message ?? result.stderr.trim());
    process.exitCode = 1;
  } else {
    const parsed: unknown = result.stdout.trim() ? JSON.parse(result.stdout) : [];
    const listeners = Array.isArray(parsed) ? parsed : [parsed];
    if (listeners.length === 0) console.log('Neither port has a listening process.');
    else console.table(listeners);
  }
} else {
  const result = spawnSync('lsof', ['-nP', '-iTCP:5173', '-iTCP:3001', '-sTCP:LISTEN'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (result.error) {
    console.error('Install lsof, then run npm run ports again.');
    process.exitCode = 1;
  } else if (result.stdout.trim()) console.log(result.stdout.trim());
  else if (result.status === 1) console.log('Neither port has a listening process.');
  else if (result.status !== 0) {
    console.error(result.stderr.trim() || 'Could not read the listening processes.');
    process.exitCode = 1;
  }
}

console.log('To stop Passport, press Ctrl+C in its original npm run dev terminal.');
