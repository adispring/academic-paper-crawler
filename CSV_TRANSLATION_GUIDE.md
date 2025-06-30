# CSV 摘要翻译工具使用指南

## 功能介绍

这个 TypeScript 脚本可以自动翻译 CSV 文件中的非中文摘要，使用 OpenAI API 进行高质量翻译。

### 主要特点

- ✅ **智能检测**：自动识别哪些摘要是非中文的
- ✅ **保留原文**：在原摘要后面空一行添加中文翻译
- ✅ **避免重复**：跳过已包含中文翻译的条目
- ✅ **错误处理**：翻译失败时保留原文，不中断处理
- ✅ **进度显示**：实时显示翻译进度和统计信息
- ✅ **灵活配置**：支持多种 AI 模型和参数配置

## 环境准备

### 1. 必需的环境变量

```bash
# 设置 OpenAI API Key（必需）
export OPENAI_API_KEY="your-openai-api-key-here"
```

### 2. 可选的环境变量

```bash
# 自定义 API 端点（可选）
export OPENAI_BASE_URL="https://api.openai.com/v1"

# AI 模型配置（可选）
export AI_MODEL="gpt-4o-mini"           # 默认 gpt-4o-mini
export AI_TEMPERATURE="0.1"             # 默认 0.1（更准确的翻译）
export AI_MAX_TOKENS="2000"             # 默认 2000
```

### 3. 环境变量配置文件

你也可以创建 `.env` 文件：

```bash
# .env 文件
OPENAI_API_KEY=your-openai-api-key-here
AI_MODEL=gpt-4o-mini
AI_TEMPERATURE=0.1
AI_MAX_TOKENS=2000
```

## 使用方法

### 基础用法

```bash
# 基础翻译（自动生成输出文件名）
npx tsx translate-csv-abstracts.ts output/papers--2025-06-30T12-01-23-287Z.csv

# 指定输出文件名
npx tsx translate-csv-abstracts.ts input.csv output_translated.csv
```

### 完整示例

```bash
# 设置 API Key
export OPENAI_API_KEY="sk-xxxxxxxxxx"

# 运行翻译
npx tsx translate-csv-abstracts.ts output/papers--2025-06-30T12-01-23-287Z.csv
```

## 输入文件要求

### CSV 格式要求

- **文件格式**：标准 CSV 文件，UTF-8 编码
- **摘要字段**：必须包含名为"摘要"或"abstract"的字段
- **标题行**：第一行必须是字段名称

### 支持的 CSV 格式

当前脚本支持项目标准的 CSV 格式：

```csv
论文标题,作者,摘要,论文链接,详情页链接,搜索关键词,抓取时间
"Paper Title","Author Name","Abstract content...","URL","Detail URL","keyword","timestamp"
```

## 翻译处理逻辑

### 1. 自动检测

脚本会自动检测每个摘要的语言：

- **中文检测**：如果中文字符占比超过 30%，认为是中文文本
- **翻译标记检测**：检查是否已包含翻译标记如"中文翻译："
- **跳过条件**：空摘要、已是中文、已包含翻译的条目

### 2. 翻译格式

原摘要会被转换为以下格式：

```
原始英文摘要内容...

中文翻译：
翻译后的中文内容...
```

### 3. 处理策略

- **成功翻译**：原文 + 空行 + "中文翻译：" + 译文
- **翻译失败**：保留原文，记录错误，继续处理下一条
- **API 限制**：每次翻译间隔 1 秒，避免触发速率限制

## 配置选项

### AI 模型选择

```bash
# 经济型模型（推荐）
export AI_MODEL="gpt-4o-mini"

# 高精度模型
export AI_MODEL="gpt-4"

# 经典模型
export AI_MODEL="gpt-3.5-turbo"
```

### 温度设置

```bash
# 精确翻译（推荐）
export AI_TEMPERATURE="0.1"

# 平衡模式
export AI_TEMPERATURE="0.3"

# 创意模式
export AI_TEMPERATURE="0.5"
```

### 令牌限制

```bash
# 标准设置（推荐）
export AI_MAX_TOKENS="2000"

# 长文本处理
export AI_MAX_TOKENS="4000"

# 经济模式
export AI_MAX_TOKENS="1000"
```

## 输出示例

### 成功运行的控制台输出

```
🌍 CSV 摘要翻译工具
===================

🔑 使用 API Key: sk-proj123...
🤖 使用模型: gpt-4o-mini
📂 输入文件: output/papers--2025-06-30T12-01-23-287Z.csv
📂 输出文件: output/papers--2025-06-30T12-01-23-287Z_translated.csv

📖 正在读取 CSV 文件...
📊 找到 156 条记录
🔍 找到摘要字段: 摘要

🔄 第 1 条: 正在翻译...
   原文: In this tutorial two organisations: the Public Law Project in London, UK and the Australian Research...
✅ 第 1 条: 翻译完成
   译文: 在本教程中，两个组织：英国伦敦的公共法项目和澳大利亚悉尼的自动化决策与社会研究中心...
📈 进度: 0.6% (1/156)

📄 第 2 条: 已是中文，跳过
📈 进度: 1.3% (2/156)

...

✅ 翻译完成！

📊 统计信息:
   处理总数: 156
   翻译成功: 89
   翻译失败: 2
   跳过数量: 65
   输出文件: output/papers--2025-06-30T12-01-23-287Z_translated.csv
```

### 翻译前后对比

**翻译前：**
```csv
论文标题,作者,摘要
"AI Bias Study","John Doe","This study examines bias in AI systems and proposes mitigation strategies."
```

**翻译后：**
```csv
论文标题,作者,摘要
"AI Bias Study","John Doe","This study examines bias in AI systems and proposes mitigation strategies.

中文翻译：
本研究考察了人工智能系统中的偏见，并提出了缓解策略。"
```

## 错误处理

### 常见错误和解决方案

1. **API Key 未设置**
   ```
   ❌ 错误：未设置 OPENAI_API_KEY 环境变量
   💡 请设置环境变量：export OPENAI_API_KEY="your-api-key"
   ```

2. **文件不存在**
   ```
   ❌ 输入文件不存在: output/papers.csv
   ```
   解决：检查文件路径是否正确

3. **摘要字段未找到**
   ```
   ❌ 未找到摘要字段，请确保CSV文件包含"摘要"或"abstract"字段
   ```
   解决：确保 CSV 包含摘要字段

4. **API 调用失败**
   ```
   ❌ 第 5 条: 翻译失败 - API rate limit exceeded
   ```
   解决：等待一段时间后重试，或降低调用频率

### 网络问题处理

如果遇到网络连接问题：

```bash
# 使用代理（如需要）
export HTTPS_PROXY="http://proxy.example.com:8080"
export HTTP_PROXY="http://proxy.example.com:8080"

# 或使用自定义 API 端点
export OPENAI_BASE_URL="https://your-proxy-api.com/v1"
```

## 最佳实践

### 1. 成本控制

- 使用 `gpt-4o-mini` 模型进行大批量翻译
- 设置较低的温度值（0.1-0.2）以获得一致的翻译
- 分批处理大文件，避免单次处理过多条目

### 2. 质量保证

- 翻译完成后抽查几条结果
- 对于重要文档，可以使用 `gpt-4` 模型提高质量
- 备份原始文件

### 3. 批量处理

```bash
# 处理多个文件的示例脚本
for file in output/*.csv; do
    echo "正在处理: $file"
    npx tsx translate-csv-abstracts.ts "$file"
    sleep 60  # 文件间等待，避免API限制
done
```

### 4. 监控和日志

```bash
# 记录详细日志
npx tsx translate-csv-abstracts.ts input.csv 2>&1 | tee translation.log

# 查看翻译统计
grep "统计信息" translation.log -A 5
```

## 故障排除

### 检查脚本状态

```bash
# 检查环境变量
echo $OPENAI_API_KEY
echo $AI_MODEL

# 测试 API 连接
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models | head -20
```

### 验证 CSV 格式

```bash
# 查看 CSV 头部
head -3 your-file.csv

# 检查字段名
head -1 your-file.csv | tr ',' '\n' | nl
```

### 恢复中断的翻译

如果翻译过程中断，可以：

1. 备份已翻译的部分结果
2. 手动编辑 CSV，移除已翻译的条目
3. 重新运行脚本处理剩余条目
4. 合并结果

## 扩展功能

### 自定义翻译提示

脚本使用的翻译提示可以通过修改代码自定义：

```typescript
// 在 translateAbstract 方法中修改
const prompt = `请将以下英文学术论文摘要翻译成中文，要求：
1. 保持学术性和专业性
2. 准确传达原文意思
3. 使用流畅的中文表达
4. 保留专业术语的准确性

英文摘要：
${abstract}

请只返回中文翻译，不要包含其他说明文字。`;
```

### 支持其他语言

脚本可以修改以支持其他语言的翻译，只需：

1. 修改语言检测逻辑
2. 调整翻译提示
3. 更新输出格式

## 许可和支持

这个脚本是基于项目现有的 OpenAI 集成开发的，继承了项目的配置和最佳实践。

如有问题或建议，请参考项目的其他 AI 功能文档：
- `AI_USAGE.md` - AI 功能使用指南
- `ENV_CONFIG.md` - 环境变量配置指南
- `BROWSER_USE_INTEGRATION.md` - Browser-Use 集成文档 