const { Permission } = require('./permissions');

function createRegistry({ store, skills }) {
  const byId = new Map(skills.map(skill => [skill.id, skill]));
  function audit(kind, detail, extra = {}) { store.log(kind, detail, extra); }
  function publicPending(action) { return { actionId: action.id, skill: action.skill, permission: action.permission, summary: action.summary, status: action.status }; }
  async function request(skillId, input, context = {}) {
    const skill = byId.get(skillId);
    if (!skill) throw new Error('Unknown skill.');
    let args;
    try { args = skill.inputSchema(input || {}); }
    catch (error) { audit('skill.rejected', `${skillId}: ${error.message}`, { skill: skillId, rejected: true }); return { status: 'rejected', success: false, skill: skillId, text: error.message }; }
    const permission = typeof skill.permission === 'function' ? skill.permission(args) : skill.permission;
    audit('skill.invoked', skill.name, { skill: skillId, permission });
    if (permission === Permission.READ) return execute(skill, args, context);
    const action = store.addPending({ skill: skillId, args, permission, summary: skill.summary(args), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), context: { conversationId: context.conversationId || 'default' } });
    audit('action.pending', action.summary, { skill: skillId, actionId: action.id, permission });
    return { status: 'approval_required', success: false, skill: skillId, actionId: action.id, permission, text: `Approval required: ${action.summary}`, approval: publicPending(action) };
  }
  async function execute(skill, args, context) {
    try { const result = await skill.execute(args, context); audit('skill.completed', skill.name, { skill: skill.id, success: true }); return { status: 'completed', success: true, skill: skill.id, text: result.text, data: result.data, sources: result.sources || [] }; }
    catch (error) { audit('skill.failed', `${skill.name}: ${error.message}`, { skill: skill.id, success: false }); return { status: 'failed', success: false, skill: skill.id, text: `Unable to complete ${skill.name}: ${error.message}` }; }
  }
  async function approve(actionId, approved, context = {}) {
    const action = store.getPending(actionId);
    if (!action || action.status !== 'pending') return { status: 'rejected', text: 'That approval request is no longer available.' };
    if (action.expiresAt && new Date(action.expiresAt) <= Date.now()) { store.updatePending(actionId, { status: 'expired', resolvedAt: new Date().toISOString() }); audit('action.expired', action.summary, { skill: action.skill, actionId }); return { status: 'rejected', actionId, text: 'That approval request expired. Nothing was executed.' }; }
    if (!approved) { store.updatePending(actionId, { status: 'rejected', resolvedAt: new Date().toISOString() }); audit('action.rejected', action.summary, { skill: action.skill, actionId }); return { status: 'rejected', success: false, actionId, text: 'Action cancelled. Nothing was executed.' }; }
    const skill = byId.get(action.skill);
    if (!skill) return { status: 'failed', text: 'Skill unavailable.' };
    store.updatePending(actionId, { status: 'approved', resolvedAt: new Date().toISOString() }); audit('action.approved', action.summary, { skill: action.skill, actionId });
    const outcome = await execute(skill, action.args, context);
    outcome.actionId = actionId; return outcome;
  }
  return { request, approve, skills: () => [...byId.values()].map(({ id, name, description }) => ({ id, name, description })) };
}
module.exports = { createRegistry };
