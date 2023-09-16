import CryptoJS from "crypto-js";

export const encrypt = (textToEncrypt: string, password: string): string => {
  const ciphertext = CryptoJS.AES.encrypt(textToEncrypt, password).toString();
  return ciphertext;
};

export const decrypt = (ciphertext: string, password: string): string => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, password);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);
  return originalText;
};
