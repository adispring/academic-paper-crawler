# 环境变量配置指南

本项目支持使用 `.env` 文件来管理环境变量，提供更安全和便捷的配置方式。

## 配置步骤

### 1. 创建 .env 文件

在项目根目录创建 `.env` 文件：

```bash
cp .env.example .env  # 如果有示例文件
# 或者直接创建
touch .env
```

### 2. 配置环境变量

在 `.env` 文件中添加以下配置：

```bash
# OpenAI API 配置（必需）
OPENAI_API_KEY=your_openai_api_key_here

# 可选：自定义 OpenAI API 基础 URL
OPENAI_BASE_URL=https://api.openai.com/v1

# 可选：AI 模型默认配置
AI_MODEL=gpt-3.5-turbo
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=1000

# 可选：调试模式
DEBUG=true
```

## 环境变量说明

### 必需变量

| 变量名           | 说明            | 示例            |
| ---------------- | --------------- | --------------- |
| `OPENAI_API_KEY` | OpenAI API 密钥 | `sk-xxxxxxxxxx` |

### 可选变量

| 变量名            | 说明               | 默认值                      | 示例                        |
| ----------------- | ------------------ | --------------------------- | --------------------------- |
| `OPENAI_BASE_URL` | OpenAI API 基础URL | `https://api.openai.com/v1` | `https://api.openai.com/v1` |
| `AI_MODEL`        | 默认AI模型         | `gpt-3.5-turbo`             | `gpt-4`                     |
| `AI_TEMPERATURE`  | AI温度设置         | `0.3`                       | `0.5`                       |
| `AI_MAX_TOKENS`   | 最大令牌数         | `1000`                      | `1500`                      |
| `DEBUG`           | 调试模式           | `false`                     | `true`                      |

## 使用方式

### 直接运行（推荐）

配置好 `.env` 文件后，直接运行命令：

```bash
# 启用AI分析，使用 .env 中的配置
node dist/index.js search -k "machine learning" --ai

# 批量搜索
node dist/index.js batch -f keywords-example.txt --ai
```

### 覆盖环境变量

命令行参数会覆盖 `.env` 文件中的设置：

```bash
# 使用不同的模型
node dist/index.js search -k "deep learning" --ai --ai-model "gpt-4"

# 使用不同的API密钥
node dist/index.js search -k "nlp" --ai --ai-api-key "sk-different-key"
```

## 安全注意事项

1. **永远不要提交 .env 文件到版本控制**
   - `.env` 文件已经在 `.gitignore` 中
   - 包含敏感信息如API密钥

2. **使用 .env.example 作为模板**
   ```bash
   # .env.example（可以提交到版本控制）
   OPENAI_API_KEY=your_openai_api_key_here
   AI_MODEL=gpt-3.5-turbo
   ```

3. **生产环境建议**
   - 使用环境变量管理工具
   - 定期轮换API密钥
   - 监控API使用情况

## 故障排除

### 常见问题

1. **环境变量不生效**
   ```bash
   # 检查 .env 文件位置
   ls -la .env
   
   # 检查文件内容
   cat .env
   ```

2. **API密钥无效**
   ```bash
   # 验证密钥格式
   echo $OPENAI_API_KEY
   
   # 测试API连接
   curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/models
   ```

3. **权限问题**
   ```bash
   # 检查文件权限
   ls -la .env
   
   # 设置适当权限（仅所有者可读写）
   chmod 600 .env
   ```

## 示例配置

### 开发环境
```bash
# .env
OPENAI_API_KEY=sk-dev-key-here
AI_MODEL=gpt-3.5-turbo
AI_TEMPERATURE=0.3
DEBUG=true
```

### 生产环境
```bash
# .env
OPENAI_API_KEY=sk-prod-key-here
AI_MODEL=gpt-4
AI_TEMPERATURE=0.1
AI_MAX_TOKENS=2000
DEBUG=false
```

通过合理配置环境变量，您可以更安全、更灵活地管理项目配置！ 