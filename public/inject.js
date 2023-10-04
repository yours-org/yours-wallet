const createPandaMethod = (type) => {
  return async (params) => {
    return new Promise((resolve, reject) => {
      // Send request
      const requestEvent = new CustomEvent("PandaRequest", {
        detail: { type, params },
      });
      document.dispatchEvent(requestEvent);

      // Listen for a response
      function onResponse(e) {
        if (e.detail.type === type) {
          if (e.detail.success) {
            resolve(e.detail.data);
          } else {
            reject(e.detail.error);
          }

          document.removeEventListener("PandaResponse", onResponse);
        }
      }

      document.addEventListener("PandaResponse", onResponse, { once: true });
    });
  };
};

window.panda = {
  connect: createPandaMethod("connect"),
  isConnected: createPandaMethod("isConnected"),
  getBsvAddress: createPandaMethod("getBsvAddress"),
  getOrdAddress: createPandaMethod("getOrdAddress"),
  getOrdinals: createPandaMethod("getOrdinals"),
  sendBsv: createPandaMethod("sendBsv"),
  transferOrdinal: createPandaMethod("transferOrdinal"),
};
