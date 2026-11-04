// Tests never touch the network: anything not explicitly stubbed fails loudly.
globalThis.fetch = (async (url: unknown) => {
  throw new Error(`Test tried to reach the network: ${String(url)}`);
}) as typeof fetch;
