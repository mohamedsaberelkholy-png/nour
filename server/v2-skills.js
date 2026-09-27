const { Permission } = require('./permissions');

const catalog = [
  { id: 'web-research', name: 'Web research', description: 'Searches approved web sources and returns citations.', permission: Permission.READ, availability: 'requires_web_connector' },
  { id: 'documents', name: 'Documents', description: 'Extracts, summarizes, and compares local documents.', permission: Permission.READ, availability: 'local' },
  { id: 'calendar', name: 'Calendar', description: 'Creates and manages calendar events.', permission: Permission.APPROVAL_REQUIRED, availability: 'requires_calendar_connector' },
  { id: 'email', name: 'Email', description: 'Searches, drafts, and sends email with approval.', permission: Permission.APPROVAL_REQUIRED, availability: 'requires_email_connector' },
  { id: 'browser', name: 'Browser', description: 'Performs controlled browser actions.', permission: Permission.APPROVAL_REQUIRED, availability: 'requires_browser_connector' },
  { id: 'android', name: 'Android', description: 'Uses the paired Android client for notifications and intents.', permission: Permission.APPROVAL_REQUIRED, availability: 'native_client' },
  { id: 'automation', name: 'Automation', description: 'Runs multi-step workflows with per-step approvals.', permission: Permission.APPROVAL_REQUIRED, availability: 'local' },
  { id: 'voice', name: 'Voice', description: 'Accepts speech input and provides spoken responses.', permission: Permission.READ, availability: 'browser_capability' },
  { id: 'developer', name: 'Developer', description: 'Inspects projects and runs approved development actions.', permission: Permission.APPROVAL_REQUIRED, availability: 'local' },
  { id: 'finance', name: 'Finance', description: 'Maintains private budgets and expense records.', permission: Permission.READ, availability: 'local' },
  { id: 'health', name: 'Health', description: 'Maintains private wellness logs and reminders.', permission: Permission.READ, availability: 'local' },
  { id: 'custom-skills', name: 'Custom skills', description: 'Registers user-defined skill metadata and schemas.', permission: Permission.APPROVAL_REQUIRED, availability: 'local' }
];

function publicCatalog(store, currentSkills = []) {
  const data = store.read(); const settings = data.skillSettings || {};
  const registered = new Set(currentSkills.map(skill => skill.id));
  const localImplemented = new Set(['web-research', 'documents', 'calendar', 'browser', 'automation', 'developer', 'finance', 'health', 'custom-skills', 'voice', 'android']);
  return catalog.map(skill => ({ ...skill, enabled: settings[skill.id]?.enabled !== false, implemented: registered.has(skill.id) || [...registered].some(id => id.startsWith(`${skill.id}.`)) || localImplemented.has(skill.id), configured: Boolean(settings[skill.id]?.configured) }));
}
function setEnabled(store, id, enabled) { if (!catalog.some(skill => skill.id === id)) throw new Error('Unknown v2 skill.'); const data = store.read(); data.skillSettings = data.skillSettings || {}; data.skillSettings[id] = { ...data.skillSettings[id], enabled: Boolean(enabled), updatedAt: new Date().toISOString() }; store.write(data); store.log('skill.setting_changed', `${id}: ${enabled ? 'enabled' : 'disabled'}`, { skill: id }); return publicCatalog(store); }
function registerCustom(store, input) { if (typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,48}$/.test(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw new Error('Invalid custom skill metadata.'); const data = store.read(); data.customSkills = data.customSkills || []; const skill = { id: input.id, name: input.name.trim(), description: String(input.description || '').slice(0, 500), inputSchema: input.inputSchema || {}, permission: input.permission || Permission.READ, createdAt: new Date().toISOString() }; const existing = data.customSkills.findIndex(item => item.id === skill.id); if (existing >= 0) data.customSkills[existing] = { ...data.customSkills[existing], ...skill }; else data.customSkills.unshift(skill); data.skillSettings = data.skillSettings || {}; data.skillSettings[skill.id] = { enabled: true, configured: false, custom: true }; store.write(data); store.log('custom_skill.registered', skill.name, { skill: skill.id }); return skill; }
module.exports = { catalog, publicCatalog, setEnabled, registerCustom };
