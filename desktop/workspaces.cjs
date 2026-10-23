'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {validateSession, stageSessionData, readLimited} = require('./sessions.cjs');
const MAX_WORKSPACE_BYTES = 100 * 1024 * 1024;
const MAX_WORKSPACE_SESSIONS = 20;

function validateWorkspace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.kind !== 'workspace' || !Array.isArray(value.sessions) || !value.sessions.length || value.sessions.length > MAX_WORKSPACE_SESSIONS || !Number.isSafeInteger(value.activeIndex) || value.activeIndex < 0 || value.activeIndex >= value.sessions.length) throw new Error('Invalid workspace. Choose a workspace containing 1–20 sessions and a valid active session.');
  // Rebuild every session through the allowlist. Runtime IDs, plans, revisions,
  // cached results and disk capabilities must never be restored from a file.
  const sessions = Array.from(value.sessions, validateSession);
  const result = {version:1,kind:'workspace',sessions,activeIndex:value.activeIndex};
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_WORKSPACE_BYTES) throw new Error('Workspace exceeds 100 MB.');
  return result;
}

async function stageWorkspaceData(value, backupRoot) {
  const data = validateWorkspace(value);
  const sessions = [];
  // No contexts are installed here: the caller commits only after all sessions
  // have passed filesystem validation, so a bad later entry cannot half-open.
  for (const session of data.sessions) sessions.push(await stageSessionData(session, backupRoot));
  return {data:{...data,sessions:sessions.map(session=>session.data)},sessions};
}

async function stageWorkspace(file, backupRoot) {
  return stageWorkspaceData(JSON.parse(await readLimited(file, MAX_WORKSPACE_BYTES)), backupRoot);
}

async function writeWorkspace(file, value) {
  const data = validateWorkspace(value);
  const content = JSON.stringify(data);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, {encoding:'utf8',flag:'wx',mode:0o600});
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary,{force:true}).catch(()=>{}); }
  return data;
}

module.exports = {MAX_WORKSPACE_BYTES,MAX_WORKSPACE_SESSIONS,validateWorkspace,stageWorkspaceData,stageWorkspace,writeWorkspace};
