const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

const destructive = /\b(remove-item|del\s|erase\s|rm\s|rmdir|format|shutdown|restart-computer|stop-process|taskkill|git\s+reset|git\s+clean)\b/i;
function systemInfo() {
  return { hostname: os.hostname(), platform: `${os.type()} ${os.release()}`, arch: os.arch(), uptimeSeconds: Math.round(os.uptime()), cpu: os.cpus()[0]?.model || 'Unknown', cores: os.cpus().length, memory: { totalGB: +(os.totalmem() / 1024 ** 3).toFixed(1), freeGB: +(os.freemem() / 1024 ** 3).toFixed(1) }, load: os.loadavg(), network: os.networkInterfaces(), gpu: 'Unavailable without an optional platform adapter' };
}
function searchFiles(query, root, policy) {
  if (typeof query !== 'string' || !query.trim() || query.length > 160) throw new Error('Invalid file search.');
  const safeRoot = policy ? policy.canonical(root || policy.root) : path.resolve(root || process.cwd()); const matches = []; const needle = query.toLowerCase();
  function walk(dir, depth) {
    if (depth > 5 || matches.length >= 60) return;
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (['node_modules', '.git', 'data'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      let canonical; try { canonical = policy ? policy.canonical(full) : full; } catch { continue; }
      if (entry.name.toLowerCase().includes(needle)) matches.push({ path: canonical, type: entry.isDirectory() ? 'folder' : 'file' });
      if (entry.isDirectory() && !entry.isSymbolicLink()) walk(canonical, depth + 1);
    }
  }
  walk(safeRoot, 0); return { root: safeRoot, matches };
}
async function executeCommand(command, approved = false) {
  if (destructive.test(command) && !approved) return { requiresApproval: true, reason: 'This command can delete data, stop processes, or change system state.' };
  const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
  const args = process.platform === 'win32' ? ['-NoProfile', '-Command', command] : ['-lc', command];
  try { const { stdout, stderr } = await run(shell, args, { timeout: 12000, maxBuffer: 1024 * 1024, cwd: process.cwd() }); return { stdout, stderr, exitCode: 0 }; }
  catch (error) { return { stdout: error.stdout || '', stderr: error.stderr || error.message, exitCode: error.code ?? 1 }; }
}
async function openUrl(value) { let url; try { url = new URL(value); } catch { throw new Error('Invalid URL.'); } if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs can be opened.'); const result = await run(process.platform === 'win32' ? 'cmd.exe' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', '', url.toString()] : [url.toString()], { timeout: 8000 }); return { url: url.toString(), stdout: result.stdout || '', stderr: result.stderr || '' }; }
module.exports = { systemInfo, searchFiles, executeCommand, openUrl, destructive };
