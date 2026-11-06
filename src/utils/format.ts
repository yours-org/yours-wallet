import { toToken, toTokenSat } from 'satoshi-token';

/** Token amount for display: `amt` raw units at `dec` decimals, trailing zeros dropped (9000000 not 9000000.0000000). */
export function showAmount(amt: bigint, dec: number): string {
  if (!Number.isFinite(dec) || dec < 0) {
    return amt.toString();
  }
  return removeTrailingZeros(toToken(amt.toString(), dec, 'string'));
}

/** `showAmount` with thousands separators in the whole part: 1,000,000 and 1,234.5, exact at any size. */
export function formatTokenAmount(amt: bigint, dec: number): string {
  const plain = showAmount(amt, dec);
  const negative = plain.startsWith('-');
  const [whole, fraction] = (negative ? plain.slice(1) : plain).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

export function normalize(amt: string, dec: number): string {
  if (!Number.isFinite(dec) || dec < 0) {
    return amt.split('.')[0];
  }
  return toTokenSat(amt, dec, 'string');
}

export const formatUSD = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

export const truncate = (str: string, startLength: number, endLength: number) => {
  if (typeof str !== 'string') {
    throw new Error('Expected a string');
  }
  if (str.length <= startLength + endLength) {
    return str; // No need to truncate
  }
  const startStr = str.substring(0, startLength);
  const endStr = str.substring(str.length - endLength);
  return `${startStr}...${endStr}`;
};

export const formatNumberWithCommasAndDecimals = (number: number, decimalPlaces = 2): string => {
  if (isNaN(number)) {
    return 'Invalid Number';
  }

  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  };

  return number.toLocaleString(undefined, options);
};

/** Balance display: up to `decimalPlaces` decimals, trailing zeros dropped (238,095 not 238,095.00000000). */
export const formatLargeNumber = (number: number, decimalPlaces = 3): string => {
  if (isNaN(number)) {
    return 'Invalid Number';
  }

  if (number >= 1e9) {
    return `${removeTrailingZeros((number / 1e9).toFixed(decimalPlaces))} B`; // Billion
  } else if (number >= 1e6) {
    return `${removeTrailingZeros((number / 1e6).toFixed(decimalPlaces))} M`; // Million
  }

  // For numbers below 1 million, use the existing formatting function
  return removeTrailingZeros(formatNumberWithCommasAndDecimals(number, decimalPlaces));
};

export const convertToTokenValue = (balance: number, decimals: number): number => {
  return balance / Math.pow(10, decimals);
};

/** BSV for display: commas, up to 8 decimals, trailing zeros dropped (0.001 BSV, not 0.00100000 BSV). */
export const formatBsv = (bsv: number): string => removeTrailingZeros(formatNumberWithCommasAndDecimals(bsv, 8));

export const removeTrailingZeros = (numStr: string): string => {
  if (numStr.includes('.')) {
    return numStr.replace(/(\.\d*?[1-9])0+$|\.0*$/, '$1');
  }

  return numStr;
};

export const convertAtomicValueToReadableTokenValue = (value: number, decimals: number): string => {
  const tokenValue = convertToTokenValue(value, decimals);
  return removeTrailingZeros(formatNumberWithCommasAndDecimals(tokenValue, decimals));
};

/**
 * Get the value for a tag prefix from a tags array.
 * Tags are in format "prefix:value", e.g., "origin:abc123_0"
 * For 'type' prefix, prefers the most specific tag (one containing '/').
 */
export const getTagValue = (tags: string[] | undefined, prefix: string): string | undefined => {
  if (!tags) return undefined;
  const matchingTags = tags.filter((t) => t.startsWith(`${prefix}:`));
  if (matchingTags.length === 0) return undefined;
  // For 'type' prefix, prefer the most specific one (contains '/')
  if (prefix === 'type') {
    const specific = matchingTags.find((t) => t.includes('/'));
    if (specific) return specific.slice(prefix.length + 1);
  }
  return matchingTags[0].slice(prefix.length + 1);
};

export const getOutputName = (
  output: { customInstructions?: string; tags?: string[] },
  fallback = 'Unknown',
): string => {
  if (output.customInstructions) {
    try {
      const parsed = JSON.parse(output.customInstructions);
      if (parsed.name) return parsed.name;
    } catch {
      /* ignore */
    }
  }
  return getTagValue(output.tags, 'name') ?? fallback;
};

/**
 * Check if a tag prefix exists in a tags array.
 */
export const hasTag = (tags: string[] | undefined, prefix: string): boolean => {
  if (!tags) return false;
  return tags.some((t) => t.startsWith(`${prefix}:`));
};

/**
 * Resolve the origin outpoint for an output.
 * If the output has an `origin:<outpoint>` tag, returns that value.
 * If it has a bare `origin` tag (no colon), the output itself IS the origin —
 * return the output's own outpoint.
 */
export const resolveOriginOutpoint = (output: { outpoint: string; tags?: string[] }): string | undefined => {
  const tagged = getTagValue(output.tags, 'origin');
  if (tagged) return tagged;
  if (output.tags?.includes('origin')) return output.outpoint;
  return undefined;
};
