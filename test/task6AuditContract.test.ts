import { describe, expect, it } from 'vitest';
// @ts-expect-error Task 6 audit contract is native JavaScript.
import { TASK6_AUDIT_DOMAINS, assertTask6AuditResult } from '../.superpowers/sdd/task-6-audit-contract.mjs';

const validResult = {
  version: 1,
  domains: Object.fromEntries(TASK6_AUDIT_DOMAINS.map(({ id }: { id: string }) => [
    id,
    { passed: true, violations: 0 },
  ])),
  browser: { status: 'pending-controller-playwright' },
};

describe('Task 6 consolidated audit contract', () => {
  it('enumerates every required pure geometry domain and accepts zero violations', () => {
    expect(TASK6_AUDIT_DOMAINS.map(({ id }: { id: string }) => id)).toEqual([
      'route-crosswalk-frames',
      'plaza-street-dressing',
      'shibuya-obb-sightlines',
      'highway-clearance',
      'bridge-finale',
      'moon-assets-sightline',
      'sign-linkage-rendering',
      'water-prop-culling-lifecycle',
    ]);
    expect(assertTask6AuditResult(validResult)).toEqual(validResult);
  });

  it('rejects missing domains, violations, and fabricated browser success', () => {
    const missing = structuredClone(validResult);
    delete missing.domains['bridge-finale'];
    expect(() => assertTask6AuditResult(missing)).toThrow(/bridge-finale/i);

    const violated = structuredClone(validResult);
    violated.domains['highway-clearance'].violations = 1;
    expect(() => assertTask6AuditResult(violated)).toThrow(/highway-clearance/i);

    const fabricated = structuredClone(validResult);
    fabricated.browser.status = 'passed';
    expect(() => assertTask6AuditResult(fabricated)).toThrow(/pending|browser|transport/i);
  });

  it('accepts authoritative CDP fallback evidence without accepting generic success', () => {
    const verified = {
      ...structuredClone(validResult),
      browser: {
        status: 'verified-cdp-fallback',
        transport: 'chrome-cdp-websocket',
        evidence: '.superpowers/sdd/task-6-browser-evidence.json',
      },
    };
    expect(assertTask6AuditResult(verified)).toEqual(verified);
  });

  it('accepts strict Playwright evidence and rejects unknown transports', () => {
    for (const transport of ['playwright', 'playwright/strict']) {
      const verified = {
        ...structuredClone(validResult),
        browser: {
          status: 'verified-playwright-strict',
          transport,
          evidence: '.superpowers/sdd/task-6-browser-evidence.json',
        },
      };
      expect(assertTask6AuditResult(verified)).toEqual(verified);
    }
    expect(() => assertTask6AuditResult({
      ...structuredClone(validResult),
      browser: {
        status: 'verified-playwright-strict',
        transport: 'selenium',
        evidence: '.superpowers/sdd/task-6-browser-evidence.json',
      },
    })).toThrow(/transport|browser/i);
  });
});
