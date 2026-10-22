// Tests must never reach the network: the judge runs them without credentials.
globalThis.fetch = () => Promise.reject(new Error('Network access is disabled in tests'));
