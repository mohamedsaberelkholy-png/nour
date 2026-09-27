const test = require('node:test'); const assert = require('node:assert/strict'); const tools = require('../server/tools');
test('destructive commands are held for approval', async () => { const result = await tools.executeCommand('Remove-Item test.txt'); assert.equal(result.requiresApproval, true); });
test('system information contains capacity data', () => { const result = tools.systemInfo(); assert.ok(result.cores > 0); assert.ok(result.memory.totalGB > 0); });
test('file search remains under its supplied workspace', () => { const result = tools.searchFiles('package', process.cwd()); assert.ok(result.root.startsWith(process.cwd())); });
