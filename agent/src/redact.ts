const SECRET_KEYS = /wif|password|mnemonic|private[_-]?key|passphrase|seed|root[_-]?key|identitywif/i;

export function redact(value: unknown): string {
  if (value instanceof Error) {
    return redactString(value.message);
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  try {
    return redactString(JSON.stringify(value));
  } catch {
    return '[unserializable]';
  }
}

function redactString(input: string): string {
  let out = input;
  out = out.replace(/\b[5KL][1-9A-HJ-NP-Za-km-z]{50,52}\b/g, '[redacted-wif]');
  out = out.replace(/(["']?(?:PRIVATE_KEY_WIF|YOURS_AGENT_WIF|YOURS_AGENT_PASSWORD|ONESAT_PASSWORD)["']?\s*[:=]\s*)["']?[^"'{\s,]+/gi, '$1[redacted]');
  if (SECRET_KEYS.test(out) && out.length > 80) {
    return '[redacted]';
  }
  return out;
}

export function logError(message: string, err?: unknown): void {
  const extra = err === undefined ? '' : ` ${redact(err)}`;
  console.error(`[yours-agent] ${message}${extra}`);
}

export function logInfo(message: string): void {
  console.error(`[yours-agent] ${message}`);
}
