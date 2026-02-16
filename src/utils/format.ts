import { toToken, toTokenSat } from 'satoshi-token';

export function showAmount(amt: bigint, dec: number): string {
  if (!Number.isFinite(dec) || dec < 0) {
    return amt.toString();
  }
  return toToken(amt.toString(), dec, 'string');
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

export const toHex = (asciiStr: string) => {
  const arr1: string[] = [];
  for (let n = 0, l = asciiStr.length; n < l; n++) {
    const hex = Number(asciiStr.charCodeAt(n)).toString(16);
    arr1.push(hex);
  }
  return arr1.join('');
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

export const chunkedStringArray = (array: string[], chunkSize: number) => {
  if (chunkSize <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }

  const result = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
};

export const removeBase64Prefix = (base64Data: string): string => {
  const commaIndex = base64Data.indexOf(',');

  if (commaIndex !== -1) {
    return base64Data.slice(commaIndex + 1);
  }

  return base64Data;
};

export const formatLargeNumber = (number: number, decimalPlaces = 3): string => {
  if (isNaN(number)) {
    return 'Invalid Number';
  }

  if (number >= 1e9) {
    return `${(number / 1e9).toFixed(decimalPlaces)} B`; // Billion
  } else if (number >= 1e6) {
    return `${(number / 1e6).toFixed(decimalPlaces)} M`; // Million
  }

  // For numbers below 1 million, use the existing formatting function
  return formatNumberWithCommasAndDecimals(number, decimalPlaces);
};

export const convertToTokenValue = (balance: number, decimals: number): number => {
  return balance / Math.pow(10, decimals);
};

const removeTrailingZeros = (numStr: string): string => {
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
