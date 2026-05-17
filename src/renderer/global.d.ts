import type { OrderApi } from "../electron/preload";

declare global {
  interface Window {
    orderApi: OrderApi;
  }
}

export {};
