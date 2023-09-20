export const formatUSD = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

export const toHex = (asciiStr: string) => {
  const arr1: string[] = [];
  for (let n = 0, l = asciiStr.length; n < l; n++) {
    const hex = Number(asciiStr.charCodeAt(n)).toString(16);
    arr1.push(hex);
  }
  return arr1.join("");
};
