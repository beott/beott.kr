#!/usr/bin/env node
/**
 * `make deploy` 마지막 단계: build가 끝난 release 작업 트리를 agent-outer-loop site gate로 확인한 뒤에만
 * commit·push한다. 순서는 preflight 재판정 → git add -A → consume → git commit → post-commit → git push origin release다.
 * 어느 단계든 gate가 exit 0과 기대한 상태를 주지 않으면 그 자리에서 멈추고, 남은 index·commit은 되돌리지 않고 보고만 한다.
 * 이 wrapper는 정상 진입점만 막는다. git을 직접 실행하면 gate를 우회한다(SITE-GATE.md '보호 경계').
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEPLOY_BRANCH = 'release';
export const DEPLOY_REMOTE = 'origin';
export const PROJECT_NAME = 'beott';
export const GATE_ACTION = 'deploy';

/** Refusal raised by any deploy stage; `state` says what was left behind locally. */
export class DeployRefused extends Error {
  /** Create a refusal for one stage with gate reasons and the local state left behind. */
  constructor(stage, reasons, state = 'unchanged', recovery = []) {
    super(`site gate refused at ${stage}: ${reasons.join(', ')}`);
    this.stage = stage;
    this.reasons = reasons;
    this.state = state;
    this.recovery = recovery;
  }
}

/**
 * GIT_* variables that cannot change the repository, index, config or push destination (editor, pager, tracing).
 * Every other GIT_* variable (GIT_CONFIG_*, GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_EXEC_PATH, GIT_SSH*, ...) is refused.
 */
const HARMLESS_GIT_ENV = /^GIT_(EDITOR|SEQUENCE_EDITOR|PAGER|OPTIONAL_LOCKS|TERMINAL_PROMPT|TRACE[A-Z0-9_]*)$/;

/** Caller-set GIT_* variables that would let write git see a different repository or config than the gate. */
export function refusedGitVariables(env) {
  return Object.keys(env).filter(name => name.startsWith('GIT_') && env[name] !== undefined && !HARMLESS_GIT_ENV.test(name)).sort();
}

/**
 * Environment for add/commit/push, matching what the gate reads: account HOME (so the same ~/.gitconfig), no system
 * config, no XDG_CONFIG_HOME, no GIT_* overrides. Only what ssh push needs is carried over.
 */
export function writeGitEnvironment(env, accountHome) {
  const kept = {};
  for (const name of ['USER', 'LOGNAME', 'TMPDIR', 'SSH_AUTH_SOCK']) {
    if (env[name]) kept[name] = env[name];
  }
  return { ...kept, PATH: env.PATH || '/usr/bin:/bin', HOME: accountHome, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0' };
}

/** Installed gate CLI path, taken from the account home rather than $HOME (the gate itself refuses a swapped HOME). */
export function gateCliPath(accountHome = os.userInfo().homedir) {
  return path.join(accountHome, '.local', 'share', 'agent-outer-loop', 'agent-task.mjs');
}

/** Parse the single JSON line printed by the gate CLI; null when it is not JSON. */
function parseGateOutput(stdout) {
  try {
    return JSON.parse(String(stdout).trim());
  } catch {
    return null;
  }
}

/** Run one installed-mode gate command and return its parsed result only when it exited 0. */
function callGate(deps, stage, args) {
  const { status, stdout } = deps.gate(args);
  const result = parseGateOutput(stdout);
  deps.log(`[site-gate] ${args[1]} exit=${status} ${String(stdout).trim()}`);
  if (status !== 0 || !result || result.mode !== 'installed') {
    const reasons = result?.reasons ?? (result?.reason ? [result.reason] : []);
    return { ok: false, reasons: reasons.length ? reasons : [`gate-exit-${status}`], result };
  }
  return { ok: true, result };
}

/** Run git and return trimmed stdout, refusing the stage on a non-zero exit. */
function gitText(deps, stage, args, state = 'unchanged', recovery = []) {
  const { status, stdout } = deps.git(args, { capture: true });
  if (status !== 0) throw new DeployRefused(stage, [`git-${args[0]}-exit-${status}`], state, recovery);
  return String(stdout).trim();
}

/** Run git with inherited output, refusing the stage on a non-zero exit. */
function gitRun(deps, stage, args, state, recovery = []) {
  const { status } = deps.git(args, { capture: false });
  if (status !== 0) throw new DeployRefused(stage, [`git-${args[0]}-exit-${status}`], state, recovery);
}

/** Read a JSON document named by an environment variable; refuse when it is unset, relative or unreadable. */
function readNamedJson(env, name) {
  const file = env[name];
  if (!file || !path.isAbsolute(file)) throw new DeployRefused('input', [`${name}-missing`]);
  try {
    return { file, document: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    throw new DeployRefused('input', [`${name}-unreadable`]);
  }
}

/** Check the caller-held receipt before anything runs: installed beott deploy to release, not expired. */
function checkReceipt(receipt, env, now) {
  const reasons = [];
  if (receipt?.mode !== 'installed') reasons.push('receipt-not-installed-mode');
  if (receipt?.action !== GATE_ACTION) reasons.push('receipt-action');
  if (receipt?.project?.name !== PROJECT_NAME) reasons.push('receipt-project');
  if (receipt?.target?.branch !== DEPLOY_BRANCH) reasons.push('receipt-branch');
  if (!(Date.parse(receipt?.notAfter) > now)) reasons.push('receipt-expired');
  if (!receipt?.bound?.headSha || !receipt?.bound?.artifactTree) reasons.push('receipt-bound');
  if (reasons.length) throw new DeployRefused('receipt', reasons);
}

/**
 * Gate and publish one release deploy. Returns the pushed commit and the push URLs git resolved for it.
 * deps: { gate(args) -> {status, stdout}, git(args, {capture}) -> {status, stdout}, env, now(), log(line) }.
 */
export function runDeploy(deps, commitMessage) {
  if (!commitMessage) throw new DeployRefused('input', ['commit-message-missing']);
  const { env } = deps;
  const overrides = refusedGitVariables(env);
  if (overrides.length) throw new DeployRefused('input', overrides.map(name => `git-env-override:${name}`));
  const input = readNamedJson(env, 'SITE_GATE_INPUT');
  const receiptFile = readNamedJson(env, 'SITE_GATE_RECEIPT');
  const receipt = receiptFile.document;
  checkReceipt(receipt, env, deps.now());

  const branch = gitText(deps, 'branch', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== DEPLOY_BRANCH) throw new DeployRefused('branch', [`branch-not-${DEPLOY_BRANCH}`]);
  const base = gitText(deps, 'branch', ['rev-parse', 'HEAD']);
  if (base !== receipt.bound.headSha) throw new DeployRefused('branch', ['head-not-bound']);

  const fresh = callGate(deps, 'preflight', ['site-gate', 'preflight', input.file]);
  if (!fresh.ok || fresh.result.decision !== 'allow') {
    throw new DeployRefused('preflight', fresh.ok ? fresh.result.reasons ?? ['not-allowed'] : fresh.reasons);
  }
  for (const key of ['inputDigest', 'policyDigest', 'decisionDigest']) {
    if (fresh.result[key] !== receipt[key]) throw new DeployRefused('preflight', ['receipt-mismatch']);
  }

  const staged = 'index-staged';
  const unstage = ['git restore --staged :/  (수동 판단 후 실행, 자동 실행하지 않음)'];
  gitRun(deps, 'stage', ['add', '-A'], staged, unstage);
  const consumed = callGate(deps, 'consume', ['site-gate', 'consume', input.file, receiptFile.file]);
  if (!consumed.ok || consumed.result.status !== 'consumed' || consumed.result.receiptId !== receipt.receiptId) {
    throw new DeployRefused('consume', consumed.ok ? ['consume-status'] : consumed.reasons, staged, unstage);
  }

  gitRun(deps, 'commit', ['commit', '-m', commitMessage], staged, unstage);
  const unpushed = 'local-commit-unpushed';
  const uncommit = ['git reset --soft HEAD~1  (수동 판단 후 실행, 자동 실행하지 않음)'];
  const commit = gitText(deps, 'post-commit', ['rev-parse', 'HEAD'], unpushed, uncommit);
  const verified = callGate(deps, 'post-commit', ['site-gate', 'post-commit', receiptFile.file, commit]);
  if (!verified.ok || verified.result.status !== 'verified' || verified.result.link?.resultingCommit !== commit) {
    throw new DeployRefused('post-commit', verified.ok ? ['post-commit-status'] : verified.reasons, unpushed, uncommit);
  }

  if (gitText(deps, 'push', ['rev-parse', 'HEAD'], unpushed, uncommit) !== commit ||
    gitText(deps, 'push', ['rev-parse', '--abbrev-ref', 'HEAD'], unpushed, uncommit) !== DEPLOY_BRANCH) {
    throw new DeployRefused('push', ['head-moved-after-post-commit'], unpushed, uncommit);
  }
  const pushUrls = gitText(deps, 'push', ['remote', 'get-url', '--push', '--all', DEPLOY_REMOTE], unpushed, uncommit).split('\n');
  deps.log(`Deploying updates to GitHub... (${DEPLOY_REMOTE} push URL: ${pushUrls.join(', ')})`);
  gitRun(deps, 'push', ['push', DEPLOY_REMOTE, DEPLOY_BRANCH], unpushed, ['git push를 다시 하려면 새 preflight·receipt가 필요하다']);
  return { commit, pushUrls };
}

/**
 * Real dependencies: installed gate CLI (caller environment) and git in the
 * repository root with the gate-equivalent environment. No shell.
 */
export function realDependencies(repoRoot, { env = process.env, accountHome = os.userInfo().homedir } = {}) {
  const run = (command, args, capture, childEnv) => {
    const child = spawnSync(command, args, { cwd: repoRoot, env: childEnv, encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    return { status: child.status ?? 1, stdout: child.stdout ?? '' };
  };
  const gitEnv = writeGitEnvironment(env, accountHome);
  return {
    gate: args => run(process.execPath, [gateCliPath(accountHome), ...args], true, env),
    git: (args, { capture }) => run('git', args, capture, gitEnv),
    env,
    now: () => Date.now(),
    log: line => process.stderr.write(line + '\n'),
  };
}

/** CLI entry: `node scripts/site-gate-deploy.mjs "<commit message>"`; exit 1 on any refusal. */
function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const { commit, pushUrls } = runDeploy(realDependencies(repoRoot), process.argv[2]);
    process.stderr.write(`deployed ${commit} to ${DEPLOY_REMOTE}/${DEPLOY_BRANCH} (push URL: ${pushUrls.join(', ')})\n`);
  } catch (error) {
    if (!(error instanceof DeployRefused)) throw error;
    process.stderr.write(JSON.stringify({ refused: error.stage, reasons: error.reasons, state: error.state,
      recovery: error.recovery }) + '\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main();
