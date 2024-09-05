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
