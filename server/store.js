const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = process.env.NOUR_DATA_FILE || path.join(dataDir, 'nour.json');
const defaults = { schemaVersion: 4, memories: [], reminders: [], tasks: [], goals: [], pendingActions: [], activity: [], conversations: {}, calendarEvents: [], financeEntries: [], healthLogs: [], automations: [], emailDrafts: [], connectors: {}, notification: { enabled: false }, llmProfiles: [], activeLlmId: null, skillSettings: {}, customSkills: [], llm: { enabled: false, provider: 'OpenAI-compatible', baseUrl: '', model: '', apiKey: '' } };

function read() {
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) }; }
  catch { return structuredClone(defaults); }
}
function write(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...defaults, ...data }, null, 2));
  fs.renameSync(temporary, dataFile);
}
function id(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function addMemory(text, source = 'conversation') {
  const data = read(); const memory = { id: id('mem'), text, source, createdAt: new Date().toISOString() };
  data.memories.unshift(memory); data.memories = data.memories.slice(0, 250); write(data); return memory;
}
function addReminder(title, dueAt, recurrence = null) {
  const data = read(); const reminder = { id: id('rem'), title, dueAt, recurrence: ['daily', 'weekly', 'monthly'].includes(recurrence) ? recurrence : null, status: 'scheduled', createdAt: new Date().toISOString() };
  data.reminders.unshift(reminder); write(data); return reminder;
}
function log(action, detail, meta = {}) {
  const data = read(); data.activity.unshift({ id: id('act'), action, detail: String(detail).slice(0, 600), at: new Date().toISOString(), ...meta }); data.activity = data.activity.slice(0, 300); write(data);
}
function addTask(input) { const data = read(); const task = { id: id('task'), title: input.title, description: input.description || '', priority: input.priority || 'medium', dueAt: input.dueAt || null, project: input.project || null, status: 'open', createdAt: new Date().toISOString() }; data.tasks.unshift(task); write(data); return task; }
function completeTask(taskId) { const data = read(); const task = data.tasks.find(t => t.id === taskId); if (!task) return null; task.status = 'completed'; task.completedAt = new Date().toISOString(); write(data); return task; }
function updateTask(taskId, changes) { const data = read(); const task = data.tasks.find(t => t.id === taskId); if (!task) return null; Object.assign(task, changes); write(data); return task; }
function addGoal(input) { const data = read(); const goal = { id: id('goal'), title: input.title, description: input.description || '', priority: input.priority || 'medium', dueAt: input.dueAt || null, status: 'active', createdAt: new Date().toISOString() }; data.goals.unshift(goal); write(data); return goal; }
function updateGoal(goalId, changes) { const data = read(); const goal = data.goals.find(item => item.id === goalId); if (!goal) return null; Object.assign(goal, changes); if (goal.status === 'completed' && !goal.completedAt) goal.completedAt = new Date().toISOString(); write(data); return goal; }
function updateReminder(reminderId, changes) { const data = read(); const reminder = data.reminders.find(r => r.id === reminderId); if (!reminder) return null; Object.assign(reminder, changes); write(data); return reminder; }
function addPending(input) { const data = read(); const action = { id: id('actn'), status: 'pending', createdAt: new Date().toISOString(), ...input }; data.pendingActions.unshift(action); data.pendingActions = data.pendingActions.slice(0, 100); write(data); return action; }
function getPending(actionId) { return read().pendingActions.find(action => action.id === actionId); }
function updatePending(actionId, changes) { const data = read(); const action = data.pendingActions.find(item => item.id === actionId); if (!action) return null; Object.assign(action, changes); write(data); return action; }
function forgetMemory(query) { const data = read(); const needle = String(query).toLowerCase(); const prior = data.memories.length; data.memories = data.memories.filter(m => !m.text.toLowerCase().includes(needle)); write(data); return prior - data.memories.length; }
function setNotificationPreference(enabled) { const data = read(); data.notification = { ...data.notification, enabled: Boolean(enabled), updatedAt: new Date().toISOString() }; write(data); return data.notification; }
function setConversationPrivacy(conversationId, disabled) { const data = read(); const prior = data.conversations[conversationId] || {}; data.conversations[conversationId] = { persistenceDisabled: Boolean(disabled), messages: disabled ? [] : (prior.messages || []), updatedAt: new Date().toISOString() }; write(data); }
function appendConversationMessage(conversationId, message) { const data = read(); const current = data.conversations[conversationId] || { persistenceDisabled: false, messages: [] }; if (current.persistenceDisabled) return; current.messages = Array.isArray(current.messages) ? current.messages : []; current.messages.push({ role: message.role, content: String(message.content).slice(0, 20000), at: new Date().toISOString() }); current.messages = current.messages.slice(-200); current.updatedAt = new Date().toISOString(); data.conversations[conversationId] = current; write(data); }
module.exports = { read, write, id, addMemory, addReminder, addTask, completeTask, updateTask, addGoal, updateGoal, updateReminder, addPending, getPending, updatePending, forgetMemory, setNotificationPreference, setConversationPrivacy, appendConversationMessage, log };
