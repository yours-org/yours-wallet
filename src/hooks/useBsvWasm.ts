import init from 'bsv-wasm-web';
import { useEffect, useState } from 'react';

export const useBsvWasm = () => {
  const [bsvWasmInitialized, setBsvWasmIntialized] = useState(false);

  useEffect(() => {
    const start = async () => {
      await init();
      setBsvWasmIntialized(true);
    };
    if (!bsvWasmInitialized) {
      start();
    }
  }, [bsvWasmInitialized, setBsvWasmIntialized]);

  return { bsvWasmInitialized };
};
