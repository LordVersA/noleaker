import { getState } from '../shared/storage';
import { type CheckResult, type CheckStatus } from './analyze';
import { ROWS, runAll } from './checks';
import { LOCAL_RULE_IDS } from '../background/guard';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $('results');
const run = $<HTMLButtonElement>('run');
const results = new Map<string, CheckResult | 'pending'>();

const LABEL: Record<CheckStatus | 'pending', string> = {
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Fail',
  skip: 'Skipped',
  pending: 'Running…',
};

function renderRow(id: string, title: string, r: CheckResult | 'pending'): HTMLLIElement {
  const status = r === 'pending' ? 'pending' : r.status;
  const li = document.createElement('li');
  li.dataset.status = status;
  const dot = document.createElement('span');
  dot.className = 'dot';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = `${title} · ${LABEL[status]}`;
  li.append(dot, name);
  if (r !== 'pending') {
    const detail = document.createElement('div');
    detail.className = 'detail';
    detail.textContent = r.detail;
    li.append(detail);
    if (r.fix && (r.status === 'fail' || r.status === 'warn' || r.status === 'skip')) {
      const fix = document.createElement('div');
      fix.className = 'fix';
      fix.textContent = `Fix: ${r.fix.text}`;
      if (r.fix.page === 'options') {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = 'Open options';
        a.addEventListener('click', (e) => {
          e.preventDefault();
          void chrome.runtime.openOptionsPage();
        });
        fix.append(a);
      }
      li.append(fix);
    }
  }
  li.id = `row-${id}`;
  return li;
}

function render(): void {
  list.replaceChildren(
    ...ROWS.map((row) => renderRow(row.id, row.title, results.get(row.id) ?? 'pending')),
  );
  const done = [...results.values()].filter((r): r is CheckResult => r !== 'pending');
  const verdict = $('verdict');
  if (done.length < ROWS.length) {
    verdict.dataset.level = 'idle';
    $('verdict-title').textContent = 'Running checks…';
    $('verdict-sub').textContent = `${done.length} of ${ROWS.length} done`;
    return;
  }
  const fails = done.filter((r) => r.status === 'fail').length;
  const warns = done.filter((r) => r.status === 'warn').length;
  const skips = done.filter((r) => r.status === 'skip').length;
  verdict.dataset.level = fails ? 'bad' : warns || skips ? 'warn' : 'ok';
  $('verdict-title').textContent = fails
    ? `${fails} check${fails > 1 ? 's' : ''} failed`
    : warns || skips
      ? 'Passed with warnings'
      : 'All checks passed';
  $('verdict-sub').textContent =
    `${done.length - fails - warns - skips} passed · ${warns} warnings · ${fails} failed · ${skips} skipped`;
}

async function start(): Promise<void> {
  run.disabled = true;
  results.clear();
  for (const row of ROWS) results.set(row.id, 'pending');
  render();
  const state = await getState();
  if (!state.enabled) {
    for (const row of ROWS) {
      results.set(row.id, {
        id: row.id,
        title: row.title,
        status: 'skip',
        detail: 'The proxy is off.',
        fix: { text: 'Turn the proxy on in the popup, then run the test again.', page: 'popup' },
      });
    }
    render();
  } else {
    await runAll(state, (r) => {
      results.set(r.id, r);
      render();
    });
  }
  run.disabled = false;
}

run.addEventListener('click', () => void start());
void start();

$('read-controls').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('read-controls');
  button.disabled = true;
  const output = $('controls-output');
  output.textContent = 'Reading browser settings…';
  try {
    const [state, proxy, prediction, rtc, rules, incognito] = await Promise.all([
      getState(),
      chrome.proxy.settings.get({ incognito: false }),
      chrome.privacy.network.networkPredictionEnabled.get({}),
      chrome.privacy.network.webRTCIPHandlingPolicy.get({}),
      chrome.declarativeNetRequest.getDynamicRules(),
      chrome.extension.isAllowedIncognitoAccess(),
    ]);
    const local = rules.filter((rule) => LOCAL_RULE_IDS.includes(rule.id));
    const regexChecks = await Promise.all(
      local.map(async (rule) => ({
        id: rule.id,
        ...(await chrome.declarativeNetRequest.isRegexSupported({
          regex: rule.condition.regexFilter!,
        })),
      })),
    );
    const snapshot = {
      evidence: 'Configuration snapshot only; no traffic measurement',
      measuredAt: new Date().toISOString(),
      browser: navigator.userAgent,
      enabled: state.enabled,
      routingMode: state.routingMode,
      killSwitchActive: state.killSwitchActive,
      protectionError: state.protectionError,
      controlsVerifiedAt: state.controlsVerifiedAt,
      proxy: {
        levelOfControl: proxy.levelOfControl,
        mode: proxy.value.mode,
        mandatory: proxy.value.pacScript?.mandatory === true,
      },
      prediction: { levelOfControl: prediction.levelOfControl, value: prediction.value },
      webrtc: { levelOfControl: rtc.levelOfControl, value: rtc.value },
      ruleIds: rules.map((rule) => rule.id).sort((a, b) => a - b),
      localRulesInstalled: local.length,
      localRulesExpected: LOCAL_RULE_IDS.length,
      allLocalRegexSupported: regexChecks.every((check) => check.isSupported),
      regexChecks,
      incognitoPermission: incognito,
      currentContextIncognito: chrome.extension.inIncognitoContext,
    };
    output.replaceChildren(
      ...Object.entries(snapshot).map(([key, value]) => {
        const line = document.createElement('div');
        line.textContent = `${key}: ${JSON.stringify(value)}`;
        return line;
      }),
    );
  } catch (error) {
    output.textContent = `Could not read all controls: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
  }
});
