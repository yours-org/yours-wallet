import { describe, expect, test } from 'bun:test';
import { redact } from './redact';

describe('redact', () => {
  test('strips WIF-shaped strings', () => {
    const wif = 'L1aW4aubDFB7yfras2S1eNJeK7j5B6Y6Y6Y6Y6Y6Y6Y6Y6Y6Y6Y6Y';
    expect(redact(`key=${wif}`)).not.toContain(wif);
  });

  test('strips password env assignments', () => {
    const out = redact('YOURS_AGENT_PASSWORD=super-secret-value-here');
    expect(out).not.toContain('super-secret-value-here');
    expect(out).toContain('[redacted]');
  });
});
