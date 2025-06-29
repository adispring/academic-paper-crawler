# 学术论文爬虫工具

一个专为学术研究设计的智能爬虫工具，能够自动从 SIGCHI 会议网站爬取论文信息，包括标题、作者、摘要和论文链接。现已集成 **LangGraph SDK** 和 **OpenAI** 模型，提供强大的AI分析功能。

## ✨ 功能特性

- 🔍 **智能搜索**: 基于关键词搜索相关论文
- 📄 **详细信息**: 提取论文的标题、作者、摘要和下载链接
- 📊 **多种输出格式**: 支持 CSV 和 JSON 格式输出
- 🚀 **批量处理**: 支持批量搜索多个关键词
- 🔧 **可配置**: 丰富的配置选项，适应不同需求
- 📝 **详细日志**: 完整的爬取过程记录和错误报告
- 🖥️ **无头模式**: 支持后台运行，也可开启浏览器界面调试

### 🤖 AI 智能分析功能（新增）

- 📝 **智能总结**: 自动生成论文摘要总结
- 🏷️ **自动分类**: 根据内容对论文进行分类
- 🔍 **关键词提取**: 智能提取论文关键词
- 💭 **情感分析**: 分析论文摘要的情感倾向
- ⭐ **相关性评分**: 评估论文与搜索关键词的相关性

## 📋 技术栈

- **核心**: TypeScript + Node.js
- **爬虫**: Puppeteer (无头浏览器)
- **AI分析**: LangGraph SDK + OpenAI
- **命令行**: Commander.js
- **文件处理**: CSV-Writer
- **日志**: Winston

## 🚀 安装使用

### 1. 安装依赖
```bash
npm install
```

### 2. 构建项目
```bash
npm run build
```

### 3. 基础使用
```bash
# 搜索单个关键词
node dist/index.js search -k "artificial intelligence"

# 批量搜索
node dist/index.js batch -f keywords-example.txt
```

### 4. AI 增强功能

#### 方法一：使用 .env 文件（推荐）
```bash
# 1. 复制配置模板
cp .env.example .env

# 2. 编辑 .env 文件，添加您的 API 密钥
# OPENAI_API_KEY=your_openai_api_key_here

# 3. 启用AI分析
node dist/index.js search -k "machine learning" --ai

# 4. 批量搜索
node dist/index.js batch -f keywords-example.txt --ai
```

#### 方法二：使用环境变量
```bash
# 设置环境变量
export OPENAI_API_KEY="your_openai_api_key_here"

# 启用AI分析
node dist/index.js search -k "machine learning" --ai
```

#### 方法三：使用命令行参数
```bash
# 使用指定模型
node dist/index.js search -k "deep learning" --ai --ai-model "gpt-4"

# 完整AI配置示例
node dist/index.js search -k "natural language processing" \
  --ai \
  --ai-model "gpt-3.5-turbo" \
  --ai-temperature 0.3 \
  --ai-max-tokens 1000 \
  --ai-api-key "your_key_here"
```

## 📖 详细使用说明

### 基础命令

#### 搜索命令
```bash
node dist/index.js search [选项]

选项:
  -k, --keyword <keyword>     搜索关键词 (必需)
  -o, --output <path>         输出目录路径 (默认: "./output")
  -f, --format <format>       输出格式 (csv|json) (默认: "csv")
  --headless <headless>       是否使用无头模式 (默认: "true")
  --timeout <timeout>         超时时间(毫秒) (默认: "60000")
  --max-retries <retries>     最大重试次数 (默认: "3")
  --retry-delay <delay>       重试延迟(毫秒) (默认: "2000")
```

#### AI分析选项
```bash
  --ai                        启用AI分析功能
  --ai-model <model>          AI模型名称 (默认: "gpt-3.5-turbo")
  --ai-api-key <key>          OpenAI API密钥
  --ai-temperature <temp>     AI温度设置 (默认: "0.3")
  --ai-max-tokens <tokens>    AI最大令牌数 (默认: "1000")
```

#### 批量搜索
```bash
node dist/index.js batch -f keywords.txt --ai
```

### 使用示例

#### 关键词文件格式 (keywords.txt)
```
artificial intelligence
machine learning
deep learning
natural language processing
computer vision
```

#### 输出示例

**CSV格式** (启用AI分析后):
```csv
论文标题,作者,摘要,论文链接,搜索关键词,抓取时间,AI总结,AI分类,AI关键词,AI情感分析,AI相关性评分,AI模型,AI处理时间
```

**JSON格式**:
```json
{
  "searchKeyword": "machine learning",
  "crawledAt": "2024-01-01T12:00:00.000Z",
  "totalCount": 10,
  "papers": [
    {
      "title": "论文标题",
      "authors": ["作者1", "作者2"],
      "abstract": "论文摘要",
      "paperLink": "https://...",
      "aiAnalysis": {
        "summary": "AI生成的总结",
        "classification": "机器学习",
        "keywords": ["深度学习", "神经网络"],
        "sentiment": "positive",
        "relevanceScore": 9.2,
        "model": "gpt-3.5-turbo"
      }
    }
  ]
}
```

## 🔧 配置说明

### 环境变量配置

#### 使用 .env 文件（推荐）
```bash
# 1. 复制配置模板
cp .env.example .env

# 2. 编辑 .env 文件
# 必需（启用AI功能时）
OPENAI_API_KEY=your_openai_api_key_here

# 可选配置
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-3.5-turbo
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=1000
DEBUG=true
```

#### 或使用系统环境变量
```bash
export OPENAI_API_KEY=your_openai_api_key_here
export AI_MODEL=gpt-4
```

### 编程接口
```typescript
import { AcademicPaperCrawler } from './src/crawler';

const crawler = new AcademicPaperCrawler({
  outputFormat: 'json',
  outputPath: './results',
  aiConfig: {
    enabled: true,
    model: 'gpt-3.5-turbo',
    temperature: 0.3,
    maxTokens: 1000
  }
});

const papers = await crawler.searchPapers('machine learning');
```

## 📝 输出文件说明

### 文件命名
- 格式: `papers-{关键词}-{时间戳}.{格式}`
- 示例: `papers-machine-learning-2024-01-01T12-00-00-000Z.csv`

### AI分析输出
启用AI功能后，每篇论文会包含以下AI分析结果：
- 智能总结
- 论文分类
- 关键词提取
- 情感分析
- 相关性评分

## 🚨 注意事项

- 请遵守目标网站的robots.txt和使用条款
- 建议设置合理的请求间隔，避免给服务器造成压力
- AI功能需要OpenAI API密钥，会产生API使用费用
- 建议先用少量数据测试AI功能，再进行大规模处理

## 🆘 故障排除

### 常见问题

1. **爬取失败**
   - 检查网络连接
   - 确认目标网站可访问
   - 调整超时设置

2. **AI功能不工作**
   - 检查API密钥设置
   - 确认API配额充足
   - 验证网络连接

3. **性能问题**
   - 调整并发设置
   - 增加请求间隔
   - 检查系统资源

### 获取帮助
```bash
# 查看帮助
node dist/index.js --help
node dist/index.js search --help

# 启用调试日志
DEBUG=true node dist/index.js search -k "test"
```

## 📄 许可证

MIT License

## 🔗 相关文档

- [AI功能详细使用指南](./AI_USAGE.md)
- [环境变量配置指南](./ENV_CONFIG.md)
- [项目技术文档](./docs/)

---

⭐ 如果这个项目对您有帮助，请给它一个星标！

🤝 欢迎提交Issue和Pull Request来改进这个项目。
