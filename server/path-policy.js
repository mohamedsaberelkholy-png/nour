const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function createPathPolicy({ profileRoot = process.env.NOUR_PROFILE_ROOT || os.homedir() } = {}) {
  const normalize = target => path.resolve(String(target).replace(/^\\\\\?\\/, '')).toLowerCase();
  const root = normalize(profileRoot);
  const rootReal = fs.existsSync(root) ? normalize(fs.realpathSync.native(root)) : root;
  const contained = target => { target = normalize(target); return target === rootReal || target.startsWith(`${rootReal}${path.sep}`); };
  function reject(message) { const error = new Error(message); error.code = 'PATH_DENIED'; throw error; }
  function relative(...parts) {
    if (!parts.length || parts.some(part => typeof part !== 'string' || !part || part.length > 240 || part.includes('\0') || part.includes('..') || path.isAbsolute(part) || /[\\/]/.test(part))) reject('Invalid relative path component.');
    return parts;
  }
  function canonical(target, allowMissing = false) {
    const resolved = normalize(target);
    const relativeToRoot = path.relative(rootReal, resolved);
    if (relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) reject('Path is outside the approved user profile.');
    let existing = resolved;
    while (!fs.existsSync(existing)) { const parent = path.dirname(existing); if (parent === existing) break; existing = parent; }
    const existingReal = normalize(fs.realpathSync.native(existing));
    if (!contained(existingReal)) reject('Path resolves through a link outside the approved user profile.');
    if (fs.existsSync(resolved)) { const real = normalize(fs.realpathSync.native(resolved)); if (!contained(real)) reject('Path resolves through a link outside the approved user profile.'); return real; }
    if (!allowMissing) reject('Path does not exist.');
    return path.join(existingReal, path.relative(existing, resolved));
  }
  function desktop() { const target = path.join(rootReal, 'Desktop'); return canonical(target, true); }
  function namedFolder(name, location = 'Desktop') { relative(name); const parent = location === 'Desktop' ? desktop() : canonical(path.join(rootReal, ...relative(location)), true); return canonical(path.join(parent, name), true); }
  function fromUserPath(value, allowMissing = false) {
    if (typeof value !== 'string' || !value || value.length > 1024 || value.includes('\0') || value.includes('..')) reject('Invalid path.');
    return canonical(path.isAbsolute(value) ? value : path.join(rootReal, value), allowMissing);
  }
  return { root: rootReal, canonical, fromUserPath, namedFolder, desktop, relative };
}
module.exports = { createPathPolicy };
