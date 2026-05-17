# 客户订单管理系统

Windows 桌面端客户订单管理系统初版，使用 Electron + React + TypeScript。本机数据存储采用 `node:sqlite`，订单附件会复制到本机应用数据目录下的订单文件夹。

## 功能

- 新建订单：设计工单号、设计费、设计分类、客户网名、客户微信、时间。
- 订单列表：搜索、分类筛选、按订单时间排序。
- 订单详情：基础信息、文件数量、上传记录。
- 文件上传：点击选择或拖拽上传，支持常见设计文件和其他文件。
- 本地持久化：SQLite 保存订单与文件记录，附件按订单归档。

## 开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm run build
npm run test:smoke
```

## 视觉参考

`assets/ui-reference-gpt-image-2.png` 是使用 `gpt-image-2` 生成的高级 UI 视觉参考，真实应用界面已按该方向用代码实现。
