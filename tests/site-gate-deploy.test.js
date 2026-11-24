/**
 * scripts/site-gate-deploy.mjs와 scripts/deploy.sh가 site gate 결과에 따라서만 commit·push하는지 검증한다.
 * 실제 gate·네트워크·원본 저장소는 쓰지 않는다. git은 mock이거나 임시 디렉터리의 격리 fixture 저장소(로컬 bare origin)다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DeployRefused,
  gateCliPath,
  realDependencies,
  refusedGitVariables,
  runDeploy,
  writeGitEnvironment,
} from '../scripts/site-gate-deploy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSION = '11111111-2222-3333-4444-555555555555';
const MESSAGE = 'rebuilding site 2026-11-21T00:00:00 KST+0900 on Unix-like system';
const NOW = Date.parse('2026-11-21T00:00:00Z');

/** Create a temp directory removed after the suite. */
const temps = [];
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
afterAll(() => temps.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

/** Receipt as the installed gate would issue it for a beott release deploy. */
function receiptFor(headSha, overrides = {}) {
  return {
    receiptId: 'sha256:' + 'r'.repeat(64), schema: 'agent-outer-loop.site-gate/v1', mode: 'installed',
    decisionDigest: 'sha256:d', inputDigest: 'sha256:i', policyDigest: 'sha256:p', executor: `orca_session_id:${SESSION}`,
    issuedAt: new Date(NOW - 60_000).toISOString(), notAfter: new Date(NOW + 600_000).toISOString(), action: 'deploy',
    project: { name: 'beott' }, target: { branch: 'release' }, bound: { headSha, sourceTree: 'sha256:s', artifactTree: 'sha256:a' },
    ...overrides,
  };
}

/** Write input/receipt fixture files and return their paths. */
function writeFixtureFiles(receipt) {
  const dir = tempDir('beott-gate-files-');
  const input = path.join(dir, 'input.json');
  const receiptPath = path.join(dir, 'receipt.json');
  fs.writeFileSync(input, JSON.stringify({ kind: 'preflight', action: 'deploy' }));
  fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  return { input, receiptPath };
}

/** Default gate answers matching the receipt; each can be replaced per test. */
function allowingGate(receipt, commitRef) {
  return {
    preflight: () => ({ status: 0, result: { mode: 'installed', decision: 'allow', reasons: [], inputDigest: receipt.inputDigest,
      policyDigest: receipt.policyDigest, decisionDigest: receipt.decisionDigest } }),
    consume: () => ({ status: 0, result: { mode: 'installed', status: 'consumed', receiptId: receipt.receiptId } }),
    'post-commit': () => ({ status: 0, result: { mode: 'installed', status: 'verified', link: { resultingCommit: commitRef() } } }),
  };
}

/** Mock git with release checked out at BASE; commit moves HEAD to NEW. Records every call. */
function mockGit(state = { branch: 'release', head: 'BASE' }) {
  const calls = [];
  const git = (args, { capture }) => {
    calls.push(args.join(' '));
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { status: 0, stdout: state.branch + '\n' };
    if (args[0] === 'rev-parse') return { status: 0, stdout: state.head + '\n' };
    if (args[0] === 'remote') return { status: 0, stdout: 'git@github.com:beott/beott.kr.git\n' };
    if (args[0] === 'commit') state.head = 'NEW';
    return { status: 0, stdout: capture ? '' : undefined };
  };
  return { git, calls, state };
}

/** Assemble mock dependencies and run one deploy, returning calls and the refusal (if any). */
function deployWith({ receipt = receiptFor('BASE'), gate = {}, env = {}, gitState, files } = {}) {
  const { input, receiptPath } = files ?? writeFixtureFiles(receipt);
  const mock = mockGit(gitState);
  const handlers = { ...allowingGate(receipt, () => mock.state.head), ...gate };
  const gateCalls = [];
  const deps = {
    gate: args => {
      gateCalls.push(args);
      const { status, result, stdout } = handlers[args[1]](args);
      return { status, stdout: stdout ?? JSON.stringify(result) };
    },
    git: mock.git,
    env: { SITE_GATE_INPUT: input, SITE_GATE_RECEIPT: receiptPath, ORCA_AGENT_SESSION_ID: SESSION, ...env },
    now: () => NOW,
    log: () => {},
  };
  let refusal = null;
  let commit = null;
  let pushUrls = null;
  try {
    ({ commit, pushUrls } = runDeploy(deps, MESSAGE));
  } catch (error) {
    if (!(error instanceof DeployRefused)) throw error;
    refusal = error;
  }
  const count = verb => mock.calls.filter(call => call.split(' ')[0] === verb).length;
  return { refusal, commit, pushUrls, gitCalls: mock.calls, gateCalls, count, input, receiptPath };
}

describe('runDeploy with mock gate and mock git', () => {
  test('allow path runs add, consume, commit, post-commit and exactly one push to origin release', () => {
    // 모든 gate 단계가 허용이면 정확한 명령이 한 번씩, 정해진 순서로 실행된다.
    const run = deployWith();

    expect(run.refusal).toBeNull();
    expect(run.commit).toBe('NEW');
    expect(run.pushUrls).toEqual(['git@github.com:beott/beott.kr.git']);
    expect(run.gateCalls.map(args => args[1])).toEqual(['preflight', 'consume', 'post-commit']);
    expect(run.gateCalls[0]).toEqual(['site-gate', 'preflight', run.input]);
    expect(run.gateCalls[1]).toEqual(['site-gate', 'consume', run.input, run.receiptPath]);
    expect(run.gateCalls[2]).toEqual(['site-gate', 'post-commit', run.receiptPath, 'NEW']);
    expect(run.gateCalls.flat()).not.toContain('--test-policy');
    expect(run.gitCalls.filter(call => !call.startsWith('rev-parse') && !call.startsWith('remote get-url'))).toEqual([
      'add -A',
      `commit -m ${MESSAGE}`,
      'push origin release',
    ]);
  });

  test.each([
    ['ORCA_AGENT_SESSION_ID is unset', { env: { ORCA_AGENT_SESSION_ID: undefined } }],
    ['ORCA_AGENT_SESSION_ID differs from receipt.executor', { env: { ORCA_AGENT_SESSION_ID: '99999999-2222-3333-4444-555555555555' } }],
  ])('allow path still runs when %s', (_name, options) => {
    // 배포 실행이 Orca 세션 환경 변수에 묶여 있지 않다.
    const run = deployWith(options);

    expect(run.refusal).toBeNull();
    expect(run.commit).toBe('NEW');
    expect(run.gitCalls.filter(call => !call.startsWith('rev-parse') && !call.startsWith('remote get-url'))).toEqual([
      'add -A',
      `commit -m ${MESSAGE}`,
      'push origin release',
    ]);
  });

  test.each([
    ['input env missing', { env: { SITE_GATE_INPUT: undefined } }, 'SITE_GATE_INPUT-missing'],
    ['receipt env missing', { env: { SITE_GATE_RECEIPT: undefined } }, 'SITE_GATE_RECEIPT-missing'],
    ['receipt file missing', { env: { SITE_GATE_RECEIPT: '/nonexistent/receipt.json' } }, 'SITE_GATE_RECEIPT-unreadable'],
    ['relative input path', { env: { SITE_GATE_INPUT: 'input.json' } }, 'SITE_GATE_INPUT-missing'],
    ['receipt expired', { receipt: receiptFor('BASE', { notAfter: new Date(NOW - 1).toISOString() }) }, 'receipt-expired'],
    ['test-mode receipt', { receipt: receiptFor('BASE', { mode: 'test' }) }, 'receipt-not-installed-mode'],
    ['receipt for another branch', { receipt: receiptFor('BASE', { target: { branch: 'main' } }) }, 'receipt-branch'],
    ['receipt for push action', { receipt: receiptFor('BASE', { action: 'push' }) }, 'receipt-action'],
    ['GIT_SSH_COMMAND set', { env: { GIT_SSH_COMMAND: 'ssh -F /tmp/x' } }, 'git-env-override:GIT_SSH_COMMAND'],
  ])('refuses before any gate or git call when %s', (_name, options, reason) => {
    // 입력·receipt가 맞지 않으면 gate도 git도 부르지 않는다.
    const run = deployWith(options);

    expect(run.refusal?.reasons).toContain(reason);
    expect(run.refusal.state).toBe('unchanged');
    expect(run.gateCalls).toHaveLength(0);
    expect(run.gitCalls).toHaveLength(0);
  });

  test.each([
    'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM',
    'GIT_CONFIG_NOSYSTEM', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_EXEC_PATH', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_SSH', 'GIT_SSH_VARIANT', 'GIT_PROXY_COMMAND',
  ])('refuses before any gate or git call when %s is set', name => {
    // 저장소·index·config·push 목적지를 바꿀 수 있는 GIT_* 변수는 gate가 보지 못하므로 거절한다.
    const run = deployWith({ env: { [name]: '/tmp/elsewhere' } });

    expect(run.refusal?.reasons).toEqual([`git-env-override:${name}`]);
    expect(run.gateCalls).toHaveLength(0);
    expect(run.gitCalls).toHaveLength(0);
  });

  test('allows editor, pager and trace variables that cannot change the destination', () => {
    expect(refusedGitVariables({ GIT_EDITOR: 'vim', GIT_PAGER: 'less', GIT_TRACE: '1', GIT_OPTIONAL_LOCKS: '0', PATH: '/bin' }))
      .toEqual([]);
    const run = deployWith({ env: { GIT_EDITOR: 'vim' } });

    expect(run.refusal).toBeNull();
    expect(run.count('push')).toBe(1);
  });

  test.each([
    ['not on release', { branch: 'main', head: 'BASE' }, 'branch-not-release'],
    ['HEAD moved since preflight', { branch: 'release', head: 'OTHER' }, 'head-not-bound'],
  ])('refuses with read-only git only when %s', (_name, gitState, reason) => {
    // branch·HEAD 확인은 읽기 전용 rev-parse만 쓰고 gate·쓰기 명령은 실행하지 않는다.
    const run = deployWith({ gitState });

    expect(run.refusal?.reasons).toContain(reason);
    expect(run.gateCalls).toHaveLength(0);
    expect(run.gitCalls.every(call => call.startsWith('rev-parse'))).toBe(true);
  });

  const deny = reasons => () => ({ status: 1, result: { mode: 'installed', decision: 'deny', reasons } });

  test.each([
    ['candidate rollback', ['rollback-unverified']],
    ['current artifact digest changed', ['tree-mismatch']],
    ['policy no longer approved', ['policy-unapproved']],
    ['domain impact suspended', ['approval-suspended']],
  ])('runs zero write commands when post-build preflight denies: %s', (_name, reasons) => {
    // build 뒤 재판정이 거절하면 git add·commit·push가 0회다.
    const run = deployWith({ gate: { preflight: deny(reasons) } });

    expect(run.refusal.stage).toBe('preflight');
    expect(run.refusal.reasons).toEqual(reasons);
    expect(run.gateCalls.map(args => args[1])).toEqual(['preflight']);
    expect(['add', 'commit', 'push'].map(run.count)).toEqual([0, 0, 0]);
  });

  test('treats a test-mode allow (exit 4) as refusal', () => {
    // --test-policy 성공(exit 4, mode test)은 허가가 아니다.
    const run = deployWith({ gate: { preflight: () => ({ status: 4, result: { mode: 'test', decision: 'allow', reasons: [] } }) } });

    expect(run.refusal.stage).toBe('preflight');
    expect(['add', 'commit', 'push'].map(run.count)).toEqual([0, 0, 0]);
  });

  test('treats exit 0 with a test-mode body as refusal', () => {
    // exit 0이어도 mode가 installed가 아니면 진행하지 않는다.
    const run = deployWith({ gate: { preflight: () => ({ status: 0, result: { mode: 'test', decision: 'allow', reasons: [] } }) } });

    expect(run.refusal.stage).toBe('preflight');
    expect(['add', 'commit', 'push'].map(run.count)).toEqual([0, 0, 0]);
  });

  test('refuses when the fresh preflight digests differ from the receipt', () => {
    // 같은 입력의 재판정이 receipt와 다른 decision이면 다른 판단으로 본다.
    const receipt = receiptFor('BASE');
    const run = deployWith({ receipt, gate: { preflight: () => ({ status: 0, result: { mode: 'installed', decision: 'allow',
      inputDigest: receipt.inputDigest, policyDigest: receipt.policyDigest, decisionDigest: 'sha256:other' } }) } });

    expect(run.refusal.reasons).toEqual(['receipt-mismatch']);
    expect(['add', 'commit', 'push'].map(run.count)).toEqual([0, 0, 0]);
  });

  test('refuses non-JSON gate output', () => {
    const run = deployWith({ gate: { preflight: () => ({ status: 0, stdout: 'ok' }) } });

    expect(run.refusal.reasons).toEqual(['gate-exit-0']);
    expect(['add', 'commit', 'push'].map(run.count)).toEqual([0, 0, 0]);
  });

  test('stops after git add when consume rejects the staged tree and leaves the index as is', () => {
    // consume 거절(staged digest 변경, 만료, 재사용)이면 commit·push 0회. index는 자동 복구하지 않고 상태만 보고한다.
    const run = deployWith({ gate: { consume: () => ({ status: 1, stdout: JSON.stringify({ status: 'rejected',
      reasons: ['tree-mismatch'] }) }) } });

    expect(run.refusal.stage).toBe('consume');
    expect(run.refusal.reasons).toEqual(['tree-mismatch']);
    expect(run.refusal.state).toBe('index-staged');
    expect(run.refusal.recovery.join(' ')).toContain('자동 실행하지 않음');
    expect(['add', 'commit', 'push', 'reset', 'restore'].map(run.count)).toEqual([1, 0, 0, 0, 0]);
  });

  test.each([['receipt-expired'], ['receipt-consumed'], ['executor-mismatch']])('stops after git add when consume says %s', reason => {
    const run = deployWith({ gate: { consume: () => ({ status: 1, stdout: JSON.stringify({ status: 'rejected', reasons: [reason] }) }) } });

    expect(run.refusal.reasons).toEqual([reason]);
    expect(['commit', 'push'].map(run.count)).toEqual([0, 0]);
  });

  test('stops before push when post-commit rejects and keeps the local commit', () => {
    // post-commit 거절이면 local commit은 남기고 push는 0회. reset/revert를 자동 실행하지 않는다.
    const run = deployWith({ gate: { 'post-commit': () => ({ status: 1, stdout: JSON.stringify({ status: 'rejected',
      reasons: ['tree-mismatch'] }) }) } });

    expect(run.refusal.stage).toBe('post-commit');
    expect(run.refusal.state).toBe('local-commit-unpushed');
    expect(['add', 'commit', 'push', 'reset', 'revert'].map(run.count)).toEqual([1, 1, 0, 0, 0]);
  });

  test('refuses a post-commit result linked to another commit', () => {
    const run = deployWith({ gate: { 'post-commit': () => ({ status: 0, result: { mode: 'installed', status: 'verified',
      link: { resultingCommit: 'ELSEWHERE' } } }) } });

    expect(run.refusal.reasons).toEqual(['post-commit-status']);
    expect(run.count('push')).toBe(0);
  });
});

describe('realDependencies', () => {
  test('targets the installed gate under the account home and keeps the caller environment', () => {
    // gate 경로는 $HOME이 아니라 계정 홈 기준이고, 호출자 env는 덮어쓰지 않고 gate에 전달된다.
    expect(gateCliPath('/Users/someone')).toBe('/Users/someone/.local/share/agent-outer-loop/agent-task.mjs');
    expect(gateCliPath()).toBe(path.join(os.userInfo().homedir, '.local/share/agent-outer-loop/agent-task.mjs'));
    const env = { PATH: '/bin' };
    expect(realDependencies(repoRoot, { env, accountHome: '/Users/someone' }).env).toBe(env);
  });

  test('gives write git the same config view as the gate: account HOME, no system config, no overrides', () => {
    // gate는 HOME=계정 홈, GIT_CONFIG_NOSYSTEM=1로 git 설정을 읽는다. write git도 같은 설정만 보게 한다.
    const env = { PATH: '/usr/bin', HOME: '/tmp/other', XDG_CONFIG_HOME: '/tmp/xdg', SSH_AUTH_SOCK: '/tmp/agent', USER: 'u',
      GIT_CONFIG_GLOBAL: '/tmp/evil', GIT_DIR: '/tmp/repo', NODE_OPTIONS: '--require x', SITE_GATE_INPUT: '/tmp/in' };

    expect(writeGitEnvironment(env, '/Users/someone')).toEqual({ PATH: '/usr/bin', HOME: '/Users/someone', LANG: 'C',
      SSH_AUTH_SOCK: '/tmp/agent', USER: 'u', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
  });
});

/** Fake account home with an empty ~/.gitconfig; fixture git and the wrapper's write git both use it as HOME. */
function fakeAccountHome() {
  const home = tempDir('beott-gate-home-');
  fs.writeFileSync(path.join(home, '.gitconfig'), '');
  return home;
}

/** Caller environment without any GIT_* variable (the test runner may carry harmless ones). */
function cleanEnv(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  return { ...env, ...extra };
}

/** Fixture: bare origin, unrelated bare "evil" remote and a release clone with one built file. */
function fixtureRepository(home) {
  const root = tempDir('beott-gate-repo-');
  const origin = path.join(root, 'origin.git');
  const evil = path.join(root, 'evil.git');
  const work = path.join(root, 'work');
  const gitEnv = { PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' }).trim();
  git(root, 'init', '-q', '--bare', '-b', 'release', origin);
  git(root, 'init', '-q', '--bare', '-b', 'release', evil);
  git(root, 'init', '-q', '-b', 'release', work);
  git(work, 'config', 'user.name', 'fixture');
  git(work, 'config', 'user.email', 'fixture@example.invalid');
  git(work, 'remote', 'add', 'origin', origin);
  fs.writeFileSync(path.join(work, 'index.html'), 'old\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'base');
  git(work, 'push', '-q', 'origin', 'release');
  git(work, 'push', '-q', evil, 'release');
  fs.writeFileSync(path.join(work, 'index.html'), 'new build\n');
  return { root, origin, evil, work, git };
}

describe('runDeploy against an isolated fixture repository with real git and a mock gate', () => {
  let home;
  beforeEach(() => {
    home = fakeAccountHome();
  });

  /** Run the wrapper in the fixture with real git, the given gate handlers and extra caller environment. */
  function deployFixture(fixture, gateFor, extraEnv = {}) {
    const base = fixture.git(fixture.work, 'rev-parse', 'HEAD');
    const receipt = receiptFor(base);
    const files = writeFixtureFiles(receipt);
    const env = cleanEnv({ SITE_GATE_INPUT: files.input, SITE_GATE_RECEIPT: files.receiptPath, ORCA_AGENT_SESSION_ID: SESSION,
      ...extraEnv });
    const deps = realDependencies(fixture.work, { env, accountHome: home });
    const headOf = () => fixture.git(fixture.work, 'rev-parse', 'HEAD');
    const handlers = { ...allowingGate(receipt, headOf), ...gateFor(receipt) };
    deps.gate = args => {
      const { status, result } = handlers[args[1]](args);
      return { status, stdout: JSON.stringify(result) };
    };
    deps.now = () => NOW;
    deps.log = () => {};
    try {
      return { base, ...runDeploy(deps, MESSAGE), refusal: null };
    } catch (error) {
      if (!(error instanceof DeployRefused)) throw error;
      return { base, commit: null, refusal: error };
    }
  }

  test('allow pushes exactly the verified commit to the local bare origin', () => {
    const fixture = fixtureRepository(home);
    const run = deployFixture(fixture, () => ({}));

    expect(run.refusal).toBeNull();
    expect(fixture.git(fixture.origin, 'rev-parse', 'refs/heads/release')).toBe(run.commit);
    expect(fixture.git(fixture.work, 'rev-parse', 'HEAD^')).toBe(run.base);
    expect(fixture.git(fixture.work, 'log', '-1', '--format=%s')).toBe(MESSAGE);
    expect(run.pushUrls).toEqual([fixture.origin]);
    expect(fixture.git(fixture.evil, 'rev-parse', 'refs/heads/release')).toBe(run.base);
  });

  /** Env overrides that redirect write git while the gate (sanitized env) would still judge the real origin. */
  const redirections = {
    'GIT_CONFIG_COUNT pushurl': fixture => ({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'remote.origin.pushurl',
      GIT_CONFIG_VALUE_0: fixture.evil }),
    'GIT_CONFIG_PARAMETERS pushurl': fixture => ({ GIT_CONFIG_PARAMETERS: `'remote.origin.pushurl'='${fixture.evil}'` }),
    'GIT_CONFIG_GLOBAL pushInsteadOf': fixture => {
      const file = path.join(fixture.root, 'evil.gitconfig');
      fs.writeFileSync(file, `[url "${fixture.evil}"]\n\tpushInsteadOf = ${fixture.origin}\n`);
      return { GIT_CONFIG_GLOBAL: file };
    },
    'GIT_CONFIG_SYSTEM pushInsteadOf': fixture => {
      const file = path.join(fixture.root, 'evil-system.gitconfig');
      fs.writeFileSync(file, `[url "${fixture.evil}"]\n\tpushInsteadOf = ${fixture.origin}\n`);
      return { GIT_CONFIG_SYSTEM: file };
    },
    'GIT_DIR other repository': fixture => ({ GIT_DIR: fixture.evil }),
    'GIT_WORK_TREE other tree': fixture => ({ GIT_WORK_TREE: fixture.root }),
    'GIT_INDEX_FILE other index': fixture => ({ GIT_INDEX_FILE: path.join(fixture.root, 'other-index') }),
    'GIT_EXEC_PATH other helpers': fixture => ({ GIT_EXEC_PATH: fixture.root }),
  };

  test.each(Object.keys(redirections))('refuses %s with zero commit and push on both remotes', name => {
    // 리뷰에서 실제로 evil로 push된 두 경로와 같은 계열의 env를 실제 git fixture에서 확인한다.
    const fixture = fixtureRepository(home);
    const status = fixture.git(fixture.work, 'status', '--porcelain');
    const run = deployFixture(fixture, () => ({}), redirections[name](fixture));

    expect(run.refusal.stage).toBe('input');
    expect(run.refusal.reasons.every(reason => reason.startsWith('git-env-override:GIT_'))).toBe(true);
    expect(fixture.git(fixture.work, 'rev-parse', 'HEAD')).toBe(run.base);
    expect(fixture.git(fixture.work, 'status', '--porcelain')).toBe(status);
    expect(fixture.git(fixture.origin, 'rev-parse', 'refs/heads/release')).toBe(run.base);
    expect(fixture.git(fixture.evil, 'rev-parse', 'refs/heads/release')).toBe(run.base);
  });

  test('ignores XDG_CONFIG_HOME and a different HOME so the push goes to the gate-checked origin', () => {
    // GIT_*가 아닌 경로(XDG_CONFIG_HOME, HOME)로 넣은 pushInsteadOf는 write git 환경 정리로 무시된다(gate도 읽지 않음).
    const fixture = fixtureRepository(home);
    const xdg = path.join(fixture.root, 'xdg');
    fs.mkdirSync(path.join(xdg, 'git'), { recursive: true });
    const redirect = `[url "${fixture.evil}"]\n\tpushInsteadOf = ${fixture.origin}\n`;
    fs.writeFileSync(path.join(xdg, 'git', 'config'), redirect);
    const otherHome = path.join(fixture.root, 'other-home');
    fs.mkdirSync(otherHome);
    fs.writeFileSync(path.join(otherHome, '.gitconfig'), redirect);
    const run = deployFixture(fixture, () => ({}), { XDG_CONFIG_HOME: xdg, HOME: otherHome });

    expect(run.refusal).toBeNull();
    expect(run.pushUrls).toEqual([fixture.origin]);
    expect(fixture.git(fixture.origin, 'rev-parse', 'refs/heads/release')).toBe(run.commit);
    expect(fixture.git(fixture.evil, 'rev-parse', 'refs/heads/release')).toBe(run.base);
  });

  test('deny leaves origin, HEAD and the index of the fixture untouched', () => {
    const fixture = fixtureRepository(home);
    const before = fixture.git(fixture.work, 'status', '--porcelain');
    const run = deployFixture(fixture, () => ({
      preflight: () => ({ status: 1, result: { mode: 'installed', decision: 'deny', reasons: ['rollback-unverified'] } }),
    }));

    expect(run.refusal.reasons).toEqual(['rollback-unverified']);
    expect(fixture.git(fixture.origin, 'rev-parse', 'refs/heads/release')).toBe(run.base);
    expect(fixture.git(fixture.work, 'rev-parse', 'HEAD')).toBe(run.base);
    expect(fixture.git(fixture.work, 'status', '--porcelain')).toBe(before);
  });

  test('post-commit rejection keeps the local commit and leaves origin unchanged', () => {
    const fixture = fixtureRepository(home);
    const run = deployFixture(fixture, () => ({
      'post-commit': () => ({ status: 1, result: { status: 'rejected', reasons: ['tree-mismatch'] } }),
    }));

    expect(run.refusal.state).toBe('local-commit-unpushed');
    expect(fixture.git(fixture.origin, 'rev-parse', 'refs/heads/release')).toBe(run.base);
    expect(fixture.git(fixture.work, 'rev-parse', 'HEAD^')).toBe(run.base);
  });
});

describe('scripts/deploy.sh entry point in an isolated fixture repository', () => {
  test('refuses without gate input and changes neither the fixture repository nor its origin', () => {
    // make deploy의 마지막 단계(deploy.sh)를 fixture 사본에서 실행한다. 입력이 없으면 commit·push·add 모두 0회다.
    const fixture = fixtureRepository(fakeAccountHome());
    fs.mkdirSync(path.join(fixture.work, 'scripts'));
    for (const name of ['deploy.sh', 'site-gate-deploy.mjs']) {
      fs.copyFileSync(path.join(repoRoot, 'scripts', name), path.join(fixture.work, 'scripts', name));
    }
    const base = fixture.git(fixture.work, 'rev-parse', 'HEAD');
    const status = fixture.git(fixture.work, 'status', '--porcelain');
    const env = cleanEnv();
    delete env.SITE_GATE_INPUT;
    delete env.SITE_GATE_RECEIPT;

    const child = spawnSync('bash', [path.join(fixture.work, 'scripts', 'deploy.sh')], { cwd: fixture.work, env, encoding: 'utf8' });

    expect(child.status).toBe(1);
    expect(child.stderr).toContain('SITE_GATE_INPUT-missing');
    expect(fixture.git(fixture.work, 'rev-parse', 'HEAD')).toBe(base);
    expect(fixture.git(fixture.origin, 'rev-parse', 'refs/heads/release')).toBe(base);
    expect(fixture.git(fixture.work, 'status', '--porcelain')).toBe(status);
  });

  test('Windows deploy script refuses instead of running ungated git', () => {
    // windows.deploy.ps1은 gate가 없는 우회 경로였으므로 git 명령 없이 실패한다.
    const script = fs.readFileSync(path.join(repoRoot, 'scripts', 'windows.deploy.ps1'), 'utf8');

    expect(script).not.toMatch(/\bgit\b/);
    expect(script).toMatch(/exit 1/);
  });
});
