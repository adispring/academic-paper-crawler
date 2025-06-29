# 学术论文爬虫 (Academic Paper Crawler)

🚀 一个强大的学术论文信息爬虫工具，集成了先进的AI分析能力，专为研究人员和学者设计。

## ✨ 主要特性

- 🔍 **智能搜索**: 基于关键词精准搜索学术论文
- 📊 **多格式输出**: 支持 CSV 和 JSON 格式导出
- 🤖 **AI 增强分析**: 集成 OpenAI 模型进行智能分析
- 🔄 **AI 辅助提取**: 双层AI提取，确保数据完整性
- 📝 **批量处理**: 支持多关键词批量搜索
- ⚡ **高效稳定**: 内置重试机制和错误处理
- 🎯 **精准提取**: 提取论文标题、作者、摘要、链接等信息

## 🧠 AI 功能亮点

### 1. 搜索结果页面AI分析 🆕
- **智能批量提取**: 从搜索结果页面一次性识别所有论文
- **结构化解析**: AI理解页面结构，准确提取论文信息
- **摘要预提取**: 在搜索阶段就获取可见的摘要信息
- **链接验证**: 自动验证和修正论文链接

### 2. 详情页面AI增强
- **深度信息提取**: 从详情页面提取完整论文信息
- **内容质量优化**: AI清理和标准化提取的数据
- **多层次提取**: 常规提取 + AI辅助 + AI增强的三层保障

### 3. Browser-Use 智能浏览器操作 🔥
- **🤖 AI驱动操作**: 基于Browser-Use SDK的智能浏览器自动化
- **🧠 上下文理解**: AI全面理解页面内容和结构，无需依赖CSS选择器
- **🎯 智能识别**: 动态识别页面元素，自动适应网站布局变化
- **⚡ 自愈能力**: 网站结构变化时自动调整，减少维护工作

### 4. 智能论文分析
- **📋 智能总结**: 生成论文核心内容摘要
- **🏷️ 自动分类**: 识别论文研究领域和方向
- **🔍 关键词提取**: 自动提取论文核心关键词
- **💭 情感分析**: 分析论文的研究态度和倾向
- **⭐ 相关性评分**: 评估论文与搜索关键词的匹配度

## 🛠️ 技术栈

- **运行环境**: Node.js + TypeScript
- **网页爬取**: Puppeteer (无头浏览器)
- **AI 处理**: LangGraph SDK + OpenAI API
- **智能操作**: Browser-Use SDK (AI驱动浏览器自动化)
- **数据导出**: CSV Writer + JSON
- **命令行**: Commander.js
- **环境管理**: dotenv

## 📦 快速开始

### 安装依赖
```bash
npm install
```

### 环境配置
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，设置您的 OpenAI API 密钥
# OPENAI_API_KEY=your_openai_api_key_here
```

### 构建项目
```bash
npm run build
```

## 🎯 使用方法

### 1. 基础搜索
```bash
# 搜索特定关键词的论文
npx ts-node src/index.ts search -k "machine learning"

# 启用AI分析
npx ts-node src/index.ts search -k "deep learning" --ai --ai-extract

# 使用Browser-Use智能提取
npx ts-node src/index.ts search -k "neural networks" --browser-use
```

### 2. 从URL直接爬取所有文章
```bash
# 爬取会议程序页面的所有文章
npx ts-node src/index.ts crawl-url -u "https://programs.sigchi.org/facct/2025/program/all"

# 指定标识符用于文件命名
npx ts-node src/index.ts crawl-url -u "https://programs.sigchi.org/facct/2025/program/all" -i "FACCT2025"

# 启用AI功能爬取会议文章
npx ts-node src/index.ts crawl-url -u "https://programs.sigchi.org/facct/2025/program/all" --ai --browser-use
```

### 3. 高级选项
```bash
# 快速模式（跳过详情页提取）
npx ts-node src/index.ts crawl-url -u "https://programs.sigchi.org/facct/2025/program/all" --disable-detail-extraction

# 自定义输出格式和路径
npx ts-node src/index.ts crawl-url -u "https://programs.sigchi.org/facct/2025/program/all" -f json -o ./my-output
```

## 📋 命令参考

### search 命令
基于关键词搜索论文：
- `-k, --keyword <keyword>`: 搜索关键词 **(必需)**
- `-o, --output <path>`: 输出目录路径 (默认: ./output)  
- `-f, --format <format>`: 输出格式 csv|json (默认: csv)

### crawl-url 命令  
从指定URL爬取所有论文（适用于会议程序页面）：
- `-u, --url <url>`: 目标URL **(必需)**
- `-i, --identifier <identifier>`: 标识符用于文件命名 (默认: ALL_ARTICLES)
- `-o, --output <path>`: 输出目录路径 (默认: ./output)
- `-f, --format <format>`: 输出格式 csv|json (默认: csv)

### 通用选项
- `--headless <headless>`: 是否使用无头模式 (默认: true)
- `--timeout <timeout>`: 超时时间毫秒 (默认: 60000)
- `--ai`: 启用AI分析功能
- `--ai-extract`: 启用AI辅助信息提取
- `--browser-use`: 启用Browser-Use智能浏览器操作
- `--disable-detail-extraction`: 禁用详情页提取（快速模式）

## 🎯 使用场景

### 场景1：学术研究关键词搜索
当您需要搜索特定主题的论文时：
```bash
npx ts-node src/index.ts search -k "bias in AI" --ai --browser-use
```

### 场景2：会议论文全量收集
当您需要收集整个会议的所有论文时：
```bash
npx ts-node src/index.ts crawl-url -u "https://programs.sigchi.org/facct/2025/program/all" -i "FACCT2025" --ai
```

### 场景3：快速批量处理
当您需要快速处理大量论文时（跳过详情页提取）：
```bash
npx ts-node src/index.ts crawl-url -u "https://programs.sigchi.org/facct/2025/program/all" --disable-detail-extraction
```

## 🎛️ 配置选项

### 基础选项
- `-k, --keyword`: 搜索关键词
- `-o, --output`: 输出目录路径
- `-f, --format`: 输出格式 (csv|json)
- `--headless`: 无头模式 (true|false)
- `--timeout`: 超时时间(毫秒)

### AI 分析选项
- `--ai`: 启用AI论文分析功能
- `--ai-model`: AI模型 (gpt-3.5-turbo, gpt-4)
- `--ai-temperature`: AI温度设置 (0.0-1.0)
- `--ai-max-tokens`: 最大令牌数

### AI 提取选项 🆕
- `--ai-extract`: 总是使用AI提取 (最高精度)
- `--ai-extract-fallback`: 仅在常规提取失败时使用AI (推荐)
- `--ai-extract-enhance`: 使用AI增强所有提取结果 (高质量)

### 详情页提取控制 🚀
- `--enable-detail-extraction`: 启用详情页内容提取 (默认: true)
  - 完整模式：访问每个论文详情页，获取完整摘要和精确链接
  - 适用于正式研究和高质量数据收集
- `--disable-detail-extraction`: 禁用详情页提取 (快速模式)
  - 仅使用搜索结果页面信息，速度提升5-10倍
  - 适用于功能测试和大批量初步筛选

### Browser-Use 选项 🔥
- `--browser-use`: 启用Browser-Use智能浏览器操作
- `--browser-use-mode`: 操作模式选择
  - `hybrid`: 混合模式 (传统+Browser-Use，推荐)
  - `browser-use-only`: 仅使用Browser-Use (复杂网站)
  - `traditional-only`: 仅使用传统方法 (简单网站)

## 📊 输出格式

### CSV 格式 (带AI分析)
```
论文标题,作者,摘要,论文链接,搜索关键词,抓取时间,AI总结,AI分类,AI关键词,AI情感分析,AI相关性评分
```

### JSON 格式 (带AI分析)
```json
{
  "papers": [
    {
      "title": "Enhanced User Interface Design for Machine Learning Applications",
      "authors": ["John Smith", "Jane Doe"],
      "abstract": "This paper presents a comprehensive study...",
      "paperLink": "https://dl.acm.org/doi/...",
      "searchKeyword": "machine learning",
      "crawledAt": "2024-01-15T10:30:00Z",
      "aiAnalysis": {
        "summary": "本文提出了一种新的机器学习应用界面设计方法...",
        "classification": "人机交互",
        "keywords": ["机器学习", "用户界面", "交互设计"],
        "sentiment": "positive",
        "relevanceScore": 9.2,
        "model": "gpt-3.5-turbo"
      }
    }
  ]
}
```

## 🎨 AI 提取模式对比

| 模式                    | 成本   | 精度  | 速度 | 适用场景           |
| ----------------------- | ------ | ----- | ---- | ------------------ |
| `--ai-extract-fallback` | 💰 低   | ⭐⭐⭐⭐  | ⚡⚡⚡  | 日常使用，成本敏感 |
| `--ai-extract-enhance`  | 💰💰 中  | ⭐⭐⭐⭐⭐ | ⚡⚡   | 高质量要求         |
| `--ai-extract`          | 💰💰💰 高 | ⭐⭐⭐⭐⭐ | ⚡    | 复杂页面，最高精度 |

## 🤖 Browser-Use 模式对比

| 模式               | 智能度 | 适应性 | 成本   | 适用场景             |
| ------------------ | ------ | ------ | ------ | -------------------- |
| `hybrid`           | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐  | 💰💰 中  | 推荐模式，平衡各方面 |
| `browser-use-only` | ⭐⭐⭐⭐⭐  | ⭐⭐⭐⭐⭐  | 💰💰💰 高 | 复杂网站，动态内容   |
| `traditional-only` | ⭐⭐     | ⭐⭐     | 💰 低   | 简单网站，固定结构   |

## 🔧 开发相关

### 项目结构
```
src/
├── ai/              # AI 分析模块
├── config/          # 配置文件
├── types/           # TypeScript 类型定义
├── utils/           # 工具函数
├── crawler.ts       # 核心爬虫逻辑
└── index.ts         # 命令行入口
```

### 主要脚本
```bash
npm run build        # 构建项目
npm run clean        # 清理构建文件
npm run dev          # 开发模式运行
```

## 📚 相关文档

- [📖 AI 功能详细使用指南](./AI_USAGE.md)
- [⚙️ 环境变量配置说明](./ENV_CONFIG.md)
- [🎯 完整使用示例](./keywords-example.txt)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**🎉 现在就开始使用AI增强的学术论文爬虫，让研究更高效！**
