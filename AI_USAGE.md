# AI 功能使用指南

## 概述
本爬虫工具集成了先进的 AI 功能，包括论文分析、智能信息提取和革命性的 Browser-Use 智能浏览器操作，大幅提升数据获取的准确性和质量。

## 重要更新：Browser-Use 集成
我们现在支持 Browser-Use SDK，这是一个基于AI的智能浏览器自动化框架，能够让AI直接理解和操作网页，比传统的CSS选择器更智能、更可靠。

## AI 功能类型

### 1. AI 论文分析功能
对爬取到的论文进行深度分析，提供以下分析类型：
- **智能总结** (`summarize`): 生成论文核心内容摘要
- **自动分类** (`classify`): 识别论文所属研究领域
- **关键词提取** (`extract_keywords`): 提取论文核心关键词
- **情感分析** (`sentiment`): 分析论文的情感倾向
- **相关性评分** (`relevance`): 评估论文与搜索关键词的相关性

### 2. AI 辅助信息提取功能
使用AI智能提取论文的基础信息，显著提高提取成功率和准确性：

#### A. 搜索结果页面AI分析
- **批量论文识别**: 从搜索结果页面一次性提取所有论文信息
- **结构化数据提取**: 智能识别论文标题、作者、链接等关键信息
- **摘要预览**: 提取搜索结果中可见的摘要信息
- **链接验证**: 确保提取的论文链接完整有效

#### B. 详情页面AI分析
- **标题提取**: 智能识别和清理论文标题
- **作者提取**: 准确提取并格式化作者信息
- **摘要提取**: 完整提取论文摘要内容
- **链接提取**: 找到最相关的PDF或详情链接

### 3. Browser-Use 智能浏览器操作（新增🔥）
使用Browser-Use SDK进行AI驱动的智能浏览器自动化：

#### A. 智能页面理解
- **上下文感知**: AI全面理解页面内容和结构
- **元素智能识别**: 不依赖固定CSS选择器，动态识别页面元素
- **内容理解**: 基于语义理解而非简单的文本匹配
- **自适应操作**: 自动适应网站布局变化

#### B. 智能操作执行
- **自然语言指令**: 通过自然语言描述告诉AI要做什么
- **智能点击**: AI理解按钮、链接的用途后精确点击
- **智能输入**: 根据上下文智能填写表单
- **智能导航**: 理解页面流程，智能导航到目标页面

## AI 辅助提取模式

### 1. Fallback 模式（推荐）
```bash
# 仅在常规提取失败时使用AI辅助
npx ts-node src/index.ts search -k "human-computer interaction" --ai-extract-fallback
```
- **优点**: 成本低，速度快，保证成功率
- **适用场景**: 大部分网站结构正常，少数页面需要AI辅助
- **推荐程度**: ⭐⭐⭐⭐⭐

### 2. Enhance 模式
```bash
# 使用AI增强所有提取结果的质量
npx ts-node src/index.ts search -k "machine learning" --ai-extract-enhance
```
- **优点**: 提高所有结果的质量和格式一致性
- **适用场景**: 对数据质量要求极高的场景
- **推荐程度**: ⭐⭐⭐⭐

### 3. Always 模式
```bash
# 总是使用AI进行信息提取
npx ts-node src/index.ts search -k "artificial intelligence" --ai-extract
```
- **优点**: 最高的提取准确性和一致性
- **缺点**: 成本高，速度较慢
- **适用场景**: 处理复杂或非标准页面结构
- **推荐程度**: ⭐⭐⭐

## Browser-Use 操作模式

### 1. 混合模式（推荐）
```bash
# 结合传统方法和Browser-Use的优势
npx ts-node src/index.ts search -k "human-computer interaction" --browser-use --browser-use-mode hybrid
```
- **工作方式**: 首先尝试传统CSS提取，然后使用Browser-Use增强或补充
- **优点**: 速度快，准确性高，成本适中
- **适用场景**: 大多数爬取任务
- **推荐程度**: ⭐⭐⭐⭐⭐

### 2. Browser-Use专用模式
```bash
# 完全使用Browser-Use进行智能操作
npx ts-node src/index.ts search -k "virtual reality" --browser-use --browser-use-mode browser-use-only
```
- **工作方式**: 完全依赖Browser-Use SDK进行页面操作
- **优点**: 最高的智能性和适应性
- **缺点**: 成本较高，速度相对较慢
- **适用场景**: 复杂页面、动态内容、反爬虫网站
- **推荐程度**: ⭐⭐⭐⭐

### 3. 传统专用模式
```bash
# 仅使用传统CSS选择器方法
npx ts-node src/index.ts search -k "machine learning" --browser-use-mode traditional-only
```
- **工作方式**: 禁用Browser-Use，仅使用传统方法
- **优点**: 速度最快，成本最低
- **适用场景**: 网站结构稳定，CSS选择器可靠的场景
- **推荐程度**: ⭐⭐⭐

## 组合使用 AI 功能

### 完整 AI 增强爬取
```bash
# 同时启用论文分析和辅助提取
npx ts-node src/index.ts search -k "virtual reality" \
  --ai \
  --ai-extract-fallback \
  --ai-model gpt-4 \
  --ai-temperature 0.2
```

### Browser-Use + AI 组合（推荐🔥）
```bash
# 使用Browser-Use进行智能提取，结合AI分析
npx ts-node src/index.ts search -k "human-computer interaction" \
  --browser-use \
  --browser-use-mode hybrid \
  --ai \
  --ai-model gpt-4o-mini \
  --ai-temperature 0.2
```

### 高可靠性配置
```bash
# 最大化成功率的配置：Browser-Use + AI双重保障
npx ts-node src/index.ts search -k "accessibility research" \
  --browser-use \
  --browser-use-mode hybrid \
  --ai-extract-fallback \
  --ai \
  --ai-model gpt-4 \
  --ai-temperature 0.1
```

### 批量处理优化配置
```bash
# 批量处理时的推荐配置
npx ts-node src/index.ts batch -f keywords.txt \
  --browser-use \
  --browser-use-mode hybrid \
  --ai \
  --ai-extract-fallback \
  --ai-model gpt-3.5-turbo \
  --ai-temperature 0.3 \
  --delay 3000
```

## 配置说明

### 环境变量配置
```bash
# .env 文件
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，用于自定义API端点
AI_MODEL=gpt-3.5-turbo
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=1000
```

### 命令行选项
```bash
# 基础AI选项
--ai                    # 启用AI论文分析功能
--ai-model <model>      # AI模型选择 (gpt-3.5-turbo, gpt-4)
--ai-api-key <key>      # OpenAI API密钥
--ai-temperature <temp> # 温度设置 (0.0-1.0)
--ai-max-tokens <num>   # 最大令牌数

# AI辅助提取选项
--ai-extract            # 启用AI辅助提取（always模式）
--ai-extract-fallback   # 仅在常规提取失败时使用AI
--ai-extract-enhance    # 使用AI增强所有提取结果

# Browser-Use选项
--browser-use           # 启用Browser-Use智能浏览器操作
--browser-use-mode      # Browser-Use模式选择:
                        #   hybrid: 混合模式（推荐）
                        #   browser-use-only: 仅使用Browser-Use
                        #   traditional-only: 仅使用传统方法
```

## 使用示例

### 1. 基础 AI 分析
```bash
# 启用AI分析，使用默认设置
npx ts-node src/index.ts search -k "user experience design" --ai
```

### 2. 高精度提取
```bash
# 使用GPT-4进行高精度AI辅助提取
npx ts-node src/index.ts search -k "accessibility research" \
  --ai-extract-enhance \
  --ai-model gpt-4 \
  --ai-temperature 0.1
```

### 3. 成本优化配置
```bash
# 使用fallback模式最小化AI调用成本
npx ts-node src/index.ts search -k "mobile interaction" \
  --ai \
  --ai-extract-fallback \
  --ai-model gpt-3.5-turbo
```

### 4. 批量处理场景
```bash
# 批量处理多个关键词，平衡质量和成本
npx ts-node src/index.ts batch -f research_topics.txt \
  --ai \
  --ai-extract-fallback \
  --delay 5000 \
  --format json
```

### 5. Browser-Use 专项测试
```bash
# 测试Browser-Use的智能提取能力
npx ts-node test-browser-use.ts
```

### 6. 复杂网站处理
```bash
# 处理复杂或动态网站结构
npx ts-node src/index.ts search -k "augmented reality" \
  --browser-use \
  --browser-use-mode browser-use-only \
  --ai-model gpt-4 \
  --headless false  # 可观察Browser-Use操作过程
```

### 7. 成本优化的智能模式
```bash
# 在成本和智能性之间找到最佳平衡
npx ts-node src/index.ts search -k "user interface design" \
  --browser-use \
  --browser-use-mode hybrid \
  --ai-extract-fallback \
  --ai-model gpt-3.5-turbo
```

## 输出格式

### CSV 输出增强
AI 功能启用后，CSV 输出将包含以下额外列：
- `AI总结`: 论文核心内容摘要
- `AI分类`: 论文研究领域分类
- `AI关键词`: 提取的关键词列表
- `AI情感分析`: 情感倾向分析结果
- `AI相关性评分`: 与搜索关键词的相关性评分
- `AI模型`: 使用的AI模型名称
- `AI处理时间`: AI分析的时间戳

### JSON 输出增强
```json
{
  "papers": [
    {
      "title": "Enhanced User Interface Design...",
      "authors": ["John Smith", "Jane Doe"],
      "abstract": "This paper presents...",
      "paperLink": "https://dl.acm.org/...",
      "aiAnalysis": {
        "summary": "本文提出了一种新的用户界面设计方法...",
        "classification": "人机交互",
        "keywords": ["用户界面", "设计模式", "可用性"],
        "sentiment": "positive",
        "relevanceScore": 8.5,
        "model": "gpt-3.5-turbo",
        "processedAt": "2024-01-15T10:30:00Z"
      }
    }
  ]
}
```

## AI 分析流程说明

### 搜索结果页面分析流程
1. **常规提取**: 首先使用CSS选择器提取搜索结果
2. **AI判断**: 根据配置模式决定是否使用AI
3. **AI处理**: 
   - `always` 模式：直接使用AI提取所有结果
   - `enhance` 模式：使用AI增强常规提取的结果质量
   - `fallback` 模式：仅在常规提取失败时使用AI
4. **结果合并**: 将AI提取的信息与常规结果合并

### 详情页面分析流程
1. **访问详情页**: 逐个访问论文详情页面
2. **常规提取**: 使用CSS选择器提取详细信息
3. **AI增强**: 根据配置使用AI改善提取质量
4. **信息合并**: 合并搜索结果和详情页面的信息

## 性能和成本优化

### 1. 模型选择建议
- **gpt-3.5-turbo**: 快速、经济，适合大批量处理
- **gpt-4**: 精度更高，适合重要数据或复杂提取任务

### 2. 温度设置建议
- **0.1-0.3**: 用于结构化数据提取（推荐）
- **0.3-0.5**: 用于创意性分析任务
- **0.5+**: 用于需要更多创意的场景

### 3. 成本控制策略
- 优先使用 `--ai-extract-fallback` 模式
- 搜索结果页面AI分析可以减少详情页面访问次数
- 根据需要选择合适的AI分析类型
- 设置合理的批次延迟避免速率限制
- 定期监控API使用量

## 故障排除

### 常见问题
1. **API密钥未设置**: 确保设置了 `OPENAI_API_KEY` 环境变量
2. **速率限制**: 增加 `--delay` 参数值
3. **模型不可用**: 检查API密钥权限和模型可用性
4. **提取失败**: 检查网络连接和目标网站可访问性

### 调试模式
```bash
# 启用详细日志输出
DEBUG=1 npx ts-node src/index.ts search -k "test" --ai --ai-extract-fallback
```

## 最佳实践
1. 从 fallback 模式开始测试
2. 根据实际需求选择合适的AI功能组合
3. 定期备份和监控提取结果质量
4. 为批量任务设置合理的延迟
5. 使用环境变量管理敏感配置 