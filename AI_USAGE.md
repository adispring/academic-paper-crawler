# AI 功能使用指南

本项目已集成 LangGraph SDK 和 OpenAI 模型，提供强大的学术论文智能分析功能。

## 功能特性

- 📝 **智能总结**: 自动生成论文摘要总结
- 🏷️ **自动分类**: 根据内容对论文进行分类
- 🔍 **关键词提取**: 提取论文关键词
- 💭 **情感分析**: 分析论文摘要的情感倾向
- ⭐ **相关性评分**: 评估论文与搜索关键词的相关性

## 环境配置

### 1. 设置 OpenAI API 密钥

**方法一：使用 .env 文件（推荐）**
```bash
# 复制配置模板
cp .env.example .env

# 编辑 .env 文件，设置您的 API 密钥
# OPENAI_API_KEY=your_openai_api_key_here
```

**方法二：环境变量**
```bash
export OPENAI_API_KEY="your_openai_api_key_here"
```

**方法三：命令行参数**
```bash
node dist/index.js search -k "artificial intelligence" --ai --ai-api-key "your_key_here"
```

### 2. 可选配置
```bash
# 自定义模型
--ai-model gpt-4

# 调节创造性（0.0-2.0）
--ai-temperature 0.5

# 设置最大令牌数
--ai-max-tokens 1500
```

## 使用示例

### 基础AI分析
```bash
# 启用AI分析功能
npm start search -k "machine learning" --ai

# 使用指定模型
npm start search -k "deep learning" --ai --ai-model "gpt-4"

# 完整配置示例
npm start search -k "natural language processing" \
  --ai \
  --ai-model "gpt-3.5-turbo" \
  --ai-temperature 0.3 \
  --ai-max-tokens 1000 \
  --ai-api-key "your_key_here"
```

### 批量AI分析
```bash
# 对批量关键词启用AI分析
npm start batch -f keywords.txt --ai
```

## 输出格式

### CSV 输出
启用AI分析后，CSV文件将包含以下额外列：
- AI总结
- AI分类
- AI关键词
- AI情感分析
- AI相关性评分
- AI模型
- AI处理时间

### JSON 输出
JSON格式会在每个论文对象中包含 `aiAnalysis` 字段：

```json
{
  "title": "论文标题",
  "authors": ["作者1", "作者2"],
  "abstract": "论文摘要",
  "aiAnalysis": {
    "summary": "AI生成的总结",
    "classification": "人工智能",
    "keywords": ["机器学习", "深度学习"],
    "sentiment": "positive",
    "relevanceScore": 8.5,
    "model": "gpt-3.5-turbo",
    "processedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

## 编程接口

### 启用/禁用AI分析
```typescript
const crawler = new AcademicPaperCrawler({
  aiConfig: {
    enabled: true,
    model: 'gpt-3.5-turbo',
    temperature: 0.3,
    maxTokens: 1000,
    analysisTypes: ['summarize', 'extract_keywords', 'relevance']
  }
});

// 动态启用/禁用
crawler.enableAI(true);

// 检查AI服务可用性
const isAvailable = await crawler.checkAIAvailability();
```

### 自定义AI分析
```typescript
import { createPaperAnalyzer, AIAnalysisType } from './src/ai';

const analyzer = createPaperAnalyzer({
  enabled: true,
  model: 'gpt-4',
  temperature: 0.5,
  maxTokens: 1500
});

// 单独分析论文
const result = await analyzer.analyzePaper(paperInfo, AIAnalysisType.SUMMARIZE);

// 批量分析
const enhancedPapers = await analyzer.analyzeMultiplePapers(papers);
```

## 性能优化

1. **速率限制**: 系统自动在请求间添加延迟，避免触发API限制
2. **错误重试**: 内置重试机制，提高成功率
3. **并行处理**: 多种分析类型并行执行，提高效率
4. **智能缓存**: 避免重复分析相同内容

## 注意事项

- 确保有足够的 OpenAI API 配额
- AI分析会增加处理时间，请耐心等待
- 建议先用少量数据测试，再进行大规模处理
- 定期检查API使用情况，避免超出配额

## 故障排除

### 常见问题

1. **API密钥错误**
   - 检查密钥是否正确设置
   - 确认密钥有效期和权限

2. **网络连接问题**
   - 检查网络连接
   - 考虑使用代理

3. **配额不足**
   - 检查API使用情况
   - 考虑升级账户计划

### 调试模式
```bash
# 启用详细日志
DEBUG=true npm start search -k "test" --ai
```

通过这些功能，您可以获得更深入、更智能的学术论文分析结果！ 