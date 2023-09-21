const createPandaMethod = (type) => {
  return async () => {
    return new Promise((resolve, reject) => {
      // Send request
      const requestEvent = new CustomEvent("PandaRequest", {
        detail: { type },
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
  getAddress: createPandaMethod("getAddress"),
};

createPandaMethod();
