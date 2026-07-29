const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function findNextCli() {
  const nodeModulesDir = path.resolve(__dirname, '..', 'node_modules');
  const candidates = [
    path.join(nodeModulesDir, 'next'),
    ...fs
      .readdirSync(nodeModulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\.next-/.test(entry.name))
      .map((entry) => path.join(nodeModulesDir, entry.name)),
  ];

  for (const candidate of candidates) {
    const cliPath = path.join(candidate, 'dist', 'bin', 'next');
    const requireHookPath = path.join(candidate, 'dist', 'server', 'require-hook.js');

    if (fs.existsSync(cliPath) && fs.existsSync(requireHookPath)) {
      return cliPath;
    }
  }

  throw new Error('Unable to locate a usable Next.js CLI in node_modules.');
}

const cliPath = findNextCli();
const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
