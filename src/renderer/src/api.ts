import type { HuTaoPetApi } from '../../shared';

let cachedApi: HuTaoPetApi | null | undefined;

export function getApi(): HuTaoPetApi | null {
  if (cachedApi === undefined) {
    cachedApi = window.huTaoPet ?? null;
  }

  return cachedApi;
}

export function requireApi(): HuTaoPetApi {
  const api = getApi();
  if (!api) {
    throw new Error('桌宠通信没有连上，请重新启动。');
  }

  return api;
}
