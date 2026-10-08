/** Outcome of installing one group of network (declarativeNetRequest) rules. */
export interface StageStatus {
  ok: boolean;
  /** How many excluded domains the rules were meant to carry. */
  requested: number;
  /** How many they carry now. Less than `requested` means the list had to be shortened. */
  installed: number;
  error?: string;
}

export interface RulesStatus {
  /** Alt-Svc, Accept-Language and the captcha allow rule. */
  core: StageStatus;
  /** DNT / Sec-GPC / If-None-Match. Null while the headers shield is off. */
  headers: StageStatus | null;
  /** The Google Flow route block. Null while the Flow unlock is off; absent in older records. */
  flow?: StageStatus | null;
  updatedAt: number;
}

export const RULES_STATUS_KEY = 'rulesStatus';

export interface RulesProblem {
  level: 'warn' | 'bad';
  reason: string;
}

/** What is wrong with the installed rules, if anything (shown in the popup and the leak test). */
export function rulesProblem(status: RulesStatus | undefined): RulesProblem | null {
  if (!status) return null;
  if (!status.core.ok) {
    return {
      level: 'bad',
      reason: `Network rules could not be installed (${status.core.error ?? 'unknown error'}), so some leak protection may be missing.`,
    };
  }
  if (status.headers && !status.headers.ok) {
    return {
      level: 'warn',
      reason: `Privacy headers could not be installed (${status.headers.error ?? 'unknown error'}).`,
    };
  }
  if (status.flow && !status.flow.ok) {
    return {
      level: 'warn',
      reason: `The Google Flow route block could not be installed (${status.flow.error ?? 'unknown error'}). The unlock still works, but Flow may flash its error page.`,
    };
  }
  const trimmed = [status.core, status.headers].some((s) => s && s.installed < s.requested);
  if (trimmed) {
    return {
      level: 'warn',
      reason:
        'Network rules were installed with a shortened exclusion list; some excluded sites are not excluded.',
    };
  }
  return null;
}
