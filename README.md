# QuickLabel Pro

[English](#english) | [简体中文](#chinese)

---

<a name="english"></a>

## English

**QuickLabel Pro** is a high-performance, professional label management and scanning application designed for logistics, warehouses, and small businesses. It allows users to import shipping data from Google Sheets or local files, customize printing rules, and synchronize scan status across multiple devices over a local area network (LAN).

### 🚀 Key Features

- **LAN Synchronization**: Real-time synchronization between a Host and multiple Clients. Scan on one device, and the status updates instantly on all others.
- **Google Sheets Integration**: Seamlessly import batches directly from Google Sheets and sync scanned timestamps back to the cloud.
- **Intelligent Printing Rules**: Create custom rules based on data columns to display badges (e.g., "PRIORITY", "FRAGILE") or trigger alerts during scanning.
- **Auto-Update**: Built-in update mechanism to ensure all instances stay on the latest version.
- **Universal Printer Support**: Native support for various label printers with customizable scale and silent printing.
- **Responsive Dashboard**: Modern UI with real-time statistics and scan history.

### 🛠 Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Electron (Main Process)
- **Networking**: Socket.io + Express (for LAN Sync)
- **APIs**: Google Sheets API v4
- **Printing**: Electron Native Printing + `pdf-to-printer`

### 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/darrien-wang/QuickLabel.git
   cd QuickLabel
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Development Mode**:
   - Start Host (Dev): `npm run dev`
   - Start Second Client (Dev): `npm run dev:3001` (uses temporary data dir)

4. **Production Build**:
   ```bash
   npm run dist
   ```

---

<a name="chinese"></a>

## 简体中文

**QuickLabel Pro** 是一款高性能、专业的标签管理与扫描应用，专为物流、仓库和小型企业设计。它支持从 Google Sheets 或本地文件导入发货数据，自定义打印规则，并通过局域网（LAN）实时同步多个设备的扫描状态。

### 🚀 核心功能

- **局域网同步 (LAN Sync)**：支持一台主机 (Host) 与多台分机 (Client) 实时同步。在任何一台设备上扫描，所有设备的状态都会立即更新。
- **Google Sheets 深度集成**：直接从 Google 表格导入批次数据，并将扫描时间戳实时同步回云端。
- **智能打印规则**：根据数据列创建自定义规则，在扫描时自动显示标记（如“优先”、“易碎”）或触发语音/界面提醒。
- **自动更新**：内置自动更新机制，确保所有设备始终运行最新版本。
- **通用打印机支持**：原生支持各种标签打印机，支持自定义缩放和静默打印。
- **实时看板**：现代化的 UI 设计，提供实时统计数据和扫描历史记录。

### 🛠 技术栈

- **前端**：React + TypeScript + Tailwind CSS
- **后端**：Electron (主进程)
- **网络**：Socket.io + Express (用于局域网同步)
- **接口**：Google Sheets API v4
- **打印**：Electron 原生打印 + `pdf-to-printer`

### 📦 安装与运行

1. **克隆仓库**：
   ```bash
   git clone https://github.com/darrien-wang/QuickLabel.git
   cd QuickLabel
   ```

2. **安装依赖**：
   ```bash
   npm install
   ```

3. **开发模式**：
   - 启动主程序：`npm run dev`
   - 启动第二个分机（测试用）：`npm run dev:3001`

4. **打包发布**：
   ```bash
   npm run dist
   ```

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
