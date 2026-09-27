const store = require('./store');
const llm = require('./llm');

function parseDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function folderIntent(input) {
  const create = input.match(/(?:nour,?\s*)?(?:create|make)\s+(?:a\s+)?folder\s+(?:called|named)\s+["']?(.+?)["']?(?:\s+on\s+(?:my\s+)?desktop)?\.?$/i);
  if (create) return { skill: 'computer.createFolder', input: { name: create[1].trim(), location: 'Desktop' } };
  const remove = input.match(/(?:nour,?\s*)?(?:delete|remove)\s+(?:the\s+)?["']?(.+?)["']?\s+folder(?:\s+from\s+(?:my\s+)?desktop)?\.?$/i);
  return remove ? { skill: 'computer.deleteFolder', input: { name: remove[1].trim(), location: 'Desktop' } } : null;
}
function intent(input) {
  const lower = input.toLowerCase();
  if (/^don't remember anything from this conversation\.?$/i.test(input)) return { privacy: true };
  const remember = input.match(/^remember(?:\s+that)?\s+(.+)/i); if (remember) return { skill: 'memory.save', input: { text: remember[1] } };
  const forget = input.match(/^(?:forget|don't remember)\s+(.+)/i); if (forget) return { skill: 'memory.forget', input: { query: forget[1] } };
  const recall = input.match(/^(?:what do you remember about|remembered?)\s+(.+)/i); if (recall) return { skill: 'memory.search', input: { query: recall[1] } };
  const goal = input.match(/^(?:set|add|create)\s+(?:a\s+)?goal(?:\s+(?:to|called)\s*|:\s*|\s+)(.+)$/i); if (goal) return { skill: 'goals.create', input: { title: goal[1].trim() } };
  if (/^(?:show|list)\s+(?:my\s+)?goals$/i.test(input)) return { listGoals: true };
  const completeGoal = input.match(/^complete\s+goal\s+(.+)$/i); if (completeGoal) return { completeGoalTitle: completeGoal[1].trim() };
  const progress = input.match(/^(?:update\s+goal\s+)?(.+?)\s+(?:is|to)\s+(\d{1,3})%\s*(?:complete|done)?$/i) || input.match(/^(.+?)\s+(\d{1,3})%\s*(?:complete|done)?$/i); if (progress && Number(progress[2]) <= 100) return { goalProgress: progress[1].trim(), progress: Number(progress[2]) };
  if (/^(?:what should I work on|what's next|review my goals|show goal progress)$/i.test(input)) return { recommendGoals: true };
  const phoneNotice = input.match(/^(?:notify|message)\s+my\s+phone\s+(?:that\s+)?(.+)$/i); if (phoneNotice) return { skill: 'android.notify', input: { title: 'Nour notification', body: phoneNotice[1].trim() } };
  const task = input.match(/^(?:add\s+)?["']?(.+?)["']?\s+(?:to\s+)?(?:my\s+)?tasks?$/i); if (task) return { skill: 'tasks.create', input: { title: task[1] } };
  if (/^(?:what'?s|show) (?:important )?(?:today|my tasks)/i.test(input)) return { listTasks: true, importantToday: /important/i.test(input) };
  const complete = input.match(/^mark\s+(.+?)\s+(?:as\s+)?complete$/i); if (complete) return { completeTaskTitle: complete[1] };
  const reminder = input.match(/remind me to\s+(.+?)\s+(?:at|on)\s+(.+)/i); if (reminder) { const dueAt = parseDate(reminder[2]); return dueAt ? { skill: 'reminders.create', input: { title: reminder[1], dueAt } } : { error: 'I could not read that reminder time.' }; }
  if (/system|cpu|memory usage|ram|computer status|how is my computer/i.test(lower)) return { skill: 'system.inspect', input: {} };
  const search = input.match(/(?:find|search for)\s+(?:file\s+)?["']?(.+?)["']?$/i); if (search) return { skill: 'files.search', input: { query: search[1] } };
  const url = input.match(/^(?:open|browse)\s+(https?:\/\/\S+)$/i); if (url) return { skill: 'browser.open', input: { url: url[1] } };
  const read = input.match(/^(?:read|open)\s+(?:file\s+)?(.+)$/i); if (read) return { skill: 'files.read', input: { path: read[1].trim() } };
  const command = input.match(/^(?:run|execute)\s*:\s*(.+)$/i); if (command) return { skill: 'command.run', input: { command: command[1] } };
  return folderIntent(input);
}
function createAssistant({ registry, store: activeStore = store } = {}) {
  async function respondInternal(text, { conversationId = 'default' } = {}) {
    const input = String(text || '').trim(); if (!input) return { status: 'completed', text: 'I’m listening.' };
    const existingConversation = activeStore.read().conversations[conversationId] || { persistenceDisabled: false, messages: [] }; const history = Array.isArray(existingConversation.messages) ? existingConversation.messages.slice(-20).map(message => ({ role: message.role, content: message.content })) : []; const result = intent(input); const privacy = existingConversation.persistenceDisabled;
    if (!privacy && !result?.privacy) activeStore.appendConversationMessage(conversationId, { role: 'user', content: input });
    if (result?.privacy) { activeStore.setConversationPrivacy(conversationId, true); activeStore.log('conversation.privacy_enabled', 'Conversation persistence disabled'); return { status: 'completed', text: 'Understood. I will not save anything from this conversation.' }; }
    if (result?.error) return { status: 'rejected', text: result.error };
    if (result?.listGoals) { const goals = activeStore.read().goals.filter(goal => goal.status === 'active'); return { status: 'completed', skill: 'goals.list', text: goals.length ? goals.map(goal => `• [${goal.priority}] ${goal.title} — ${goal.progress || 0}%${goal.nextAction ? ` · next: ${goal.nextAction}` : ''}`).join('\n') : 'No active goals.', data: goals }; }
    if (result?.completeGoalTitle) { const goal = activeStore.read().goals.find(item => item.status === 'active' && item.title.toLowerCase() === result.completeGoalTitle.toLowerCase()); return goal ? registry.request('goals.complete', { id: goal.id }, { conversationId }) : { status: 'rejected', text: 'I could not find that active goal.' }; }
    if (result?.goalProgress) { const goal = activeStore.read().goals.find(item => item.status === 'active' && item.title.toLowerCase() === result.goalProgress.toLowerCase()); return goal ? registry.request('goals.update', { id: goal.id, progress: result.progress }, { conversationId }) : { status: 'rejected', text: 'I could not find that active goal.' }; }
    if (result?.recommendGoals) { const goals = activeStore.read().goals.filter(goal => goal.status === 'active').sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - ({ high: 0, medium: 1, low: 2 }[b.priority]) || (a.dueAt || '9999').localeCompare(b.dueAt || '9999'))); return { status: 'completed', skill: 'goals.recommend', text: goals.length ? goals.map(goal => `• ${goal.title} — ${goal.progress || 0}%${goal.nextAction ? `; next: ${goal.nextAction}` : '; define a next action'}`).join('\n') : 'You have no active goals.', data: goals }; }
    if (result?.listTasks) { const today = new Date().toISOString().slice(0, 10); const tasks = activeStore.read().tasks.filter(t => t.status === 'open' && (!result.importantToday || t.important || (t.dueAt && t.dueAt.slice(0, 10) <= today))); return { status: 'completed', skill: 'tasks.list', text: tasks.length ? tasks.map(t => `• [${t.priority}] ${t.title}`).join('\n') : 'No matching open tasks.', data: tasks }; }
    if (result?.completeTaskTitle) { const task = activeStore.read().tasks.find(t => t.status === 'open' && t.title.toLowerCase() === result.completeTaskTitle.toLowerCase()); return task ? registry.request('tasks.complete', { id: task.id }, { conversationId }) : { status: 'rejected', text: 'I could not find that open task.' }; }
    if (result?.skill) return registry.request(result.skill, result.input, { conversationId });
    try {
      const memories = activeStore.read().memories.slice(0, 12).map(m => `- ${m.text}`).join('\n');
      const goals = activeStore.read().goals.filter(goal => goal.status === 'active').slice(0, 8).map(goal => `- ${goal.title} (${goal.progress || 0}%${goal.nextAction ? `; next: ${goal.nextAction}` : ''})`).join('\n');
      const messages = [{ role: 'system', content: `You are Nour. Reply conversationally only. Never claim you took a computer action. Tools are selected and authorized by a separate server registry. Explicit memory only:\n${memories || '(empty)'}\nActive goals:\n${goals || '(empty)'}` }, ...history, { role: 'user', content: input }];
      const answer = await llm.ask(messages);
      if (answer) { activeStore.log('llm.chat', 'Model response'); return { status: 'completed', skill: 'llm', text: answer }; }
    } catch (error) { activeStore.log('llm.failed', error.message, { success: false }); return { status: 'failed', skill: 'llm', text: `Your configured LLM could not be reached: ${error.message}` }; }
    return { status: 'completed', text: 'I can manage explicit memories, goals, tasks, reminders, files, system status, and approved computer actions.' };
  }
  async function respond(text, options = {}) { const result = await respondInternal(text, options); const conversationId = options.conversationId || 'default'; if (!activeStore.read().conversations[conversationId]?.persistenceDisabled) activeStore.appendConversationMessage(conversationId, { role: 'assistant', content: result.text || '' }); return result; }
  return { respond };
}
module.exports = { createAssistant, intent };
