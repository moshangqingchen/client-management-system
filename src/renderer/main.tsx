import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import type { OrderApi } from "../electron/preload";

function createBrowserPreviewOrderApi(): OrderApi {
  const unavailable = async () => {
    throw new Error("该功能需要在桌面版中使用");
  };

  return {
    listOrders: async () => [],
    listTrashedOrders: async () => [],
    getOrder: async () => null,
    createOrder: unavailable,
    updateOrder: unavailable,
    updateOrderStatus: unavailable,
    deleteOrder: async () => false,
    restoreOrder: unavailable,
    permanentlyDeleteOrder: async () => false,
    openOrderFolder: async () => false,
    pickWechatQr: async () => null,
    setWechatQr: unavailable,
    getWechatQrPreview: async () => null,
    openWechatQr: async () => false,
    revealWechatQr: async () => false,
    attachFiles: async () => [],
    listFiles: async () => [],
    pickAndAttachFiles: async () => [],
    getFilePreview: async () => null,
    openFile: async () => false,
    revealFile: async () => false,
    getFilePath: () => "",
    copyText: (value) => {
      void navigator.clipboard?.writeText(value).catch(() => undefined);
    },
    getStorageInfo: async () => ({ databasePath: "浏览器预览", filesRoot: "浏览器预览" })
  };
}

if (!window.orderApi) {
  window.orderApi = createBrowserPreviewOrderApi();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
