# 测试使用指南

## 论文收集功能测试

### 快速测试模式

测试文件专门针对收集速度进行了优化：

- ✅ **跳过详情页提取**：只收集搜索结果页面的信息，不进入每个论文的详情页
- ✅ **快速验证收集能力**：专注于测试搜索结果页面的滚动和收集逻辑
- ✅ **节省时间**：避免访问大量详情页面，测试速度提升5-10倍
- ✅ **保持完整性**：仍然收集标题、作者、链接等关键信息

注意：在正常爬取中，系统会提取详情页的摘要和更完整的论文链接信息。

### 环境配置

在运行测试之前，请确保设置了必要的环境变量：

```bash
# 必需：OpenAI API Key
export OPENAI_API_KEY="your-openai-api-key-here"

# 可选：自定义API基础URL（如果使用代理或其他服务）
export OPENAI_BASE_URL="https://api.openai.com/v1"

# 测试URL（必需）
export TEST_URL="https://dblp.org/search?q=machine+learning"

# 搜索关键词（可选，默认为 'test'）
export SEARCH_KEYWORD="machine learning"
```

### 运行测试

#### 方式1：使用环境变量

```bash
# 设置环境变量
export OPENAI_API_KEY="your-api-key"
export TEST_URL="https://dblp.org/search?q=deep+learning"

# 运行测试
npx tsx test-paper-collection.ts
```

#### 方式2：使用命令行参数

```bash
# 直接通过命令行传递URL
export OPENAI_API_KEY="your-api-key"
npx tsx test-paper-collection.ts "https://arxiv.org/search/?query=neural+networks&searchtype=all"
```

### 测试URL示例

以下是一些可以用于测试的学术搜索网站：

1. **DBLP** - 计算机科学论文数据库
   ```
   https://dblp.org/search?q=machine+learning
   ```

2. **arXiv** - 预印本论文库
   ```
   https://arxiv.org/search/?query=deep+learning&searchtype=all
   ```

3. **Google Scholar** - 学术搜索引擎
   ```
   https://scholar.google.com/scholar?q=artificial+intelligence
   ```

4. **IEEE Xplore**
   ```
   https://ieeexplore.ieee.org/search/searchresult.jsp?queryText=neural+networks
   ```

5. **ACM Digital Library**
   ```
   https://dl.acm.org/action/doSearch?AllField=computer+vision
   ```

### 测试结果评估

测试将自动评估收集效果：

- **PASS (通过)**: 收集率 ≥ 90%
- **PARTIAL (部分通过)**: 收集率 ≥ 80%
- **FAIL (失败)**: 收集率 < 80%

### 测试输出

测试完成后将显示：

1. **基本统计**
   - 预期论文数量
   - 实际收集数量
   - 收集率百分比
   - 测试耗时

2. **详细论文列表**
   - 论文标题
   - 作者信息
   - 详情页链接

3. **测试报告**
   - 测试状态
   - 完整的JSON格式报告

### 故障排除

#### 1. API Key 错误
```
错误：The OPENAI_API_KEY environment variable is missing or empty
解决：确保设置了有效的 OPENAI_API_KEY 环境变量
```

#### 2. URL 访问问题
```
错误：导航到页面失败
解决：检查URL是否可访问，是否需要翻墙或代理
```

#### 3. 页面加载超时
```
错误：页面加载超时
解决：增加网络超时时间或检查网络连接
```

### 调试模式

如需查看详细的浏览器操作过程，可以设置环境变量：

```bash
export DEBUG=true
export HEADLESS=false  # 显示浏览器窗口
```

### 注意事项

1. **网络要求**：确保网络连接稳定，某些学术网站可能需要翻墙
2. **速率限制**：避免频繁测试同一网站，以免触发反爬机制
3. **页面结构**：不同网站的页面结构差异较大，收集效果可能有所不同
4. **JavaScript依赖**：某些动态加载的页面可能需要更长的等待时间

## 🎯 主要功能

- ✅ **快速收集测试**：只在搜索结果页面收集信息，不进入详情页
- ✅ **滚动机制验证**：测试逐步滚动收集的逻辑是否正常工作
- ✅ **收集率评估**：验证论文收集数量是否符合预期（目标90%+）
- ✅ **去重检查**：检查去重逻辑是否有效避免重复收集
- ✅ **详细报告**：生成包含收集统计和论文列表的测试报告
- ✅ **性能优化**：跳过详情页提取，测试速度提升5-10倍

## 🚀 快速开始

### 1. 环境准备

确保已经设置了环境变量：
```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="your-base-url"  # 可选
```

### 2. 运行测试

```bash
# 直接运行测试文件
npx ts-node test-paper-collection.ts
```

或者

```bash
# 如果使用 npm scripts
npm run test:collection
```

### 3. 自定义测试URL

修改 `test-paper-collection.ts` 文件中的测试URL：
```typescript
// 在 runTest() 函数中修改
const testUrl = 'https://programs.sigchi.org/chi/2025/program/content/papers';
const searchKeyword = 'your-keyword';
```

## 📊 测试输出

测试会产生以下输出：

### 实时日志
```
🚀 初始化测试浏览器...
✅ 测试浏览器初始化完成
🔗 导航到搜索结果页面: https://...
✅ 页面加载完成

🧪 开始测试论文收集功能
🔍 搜索关键词: test
📊 页面预期包含 79 篇文章，设置最大滚动次数: 27

=== 初始页面收集 ===
🆕 发现 5 个新项目:
   1. First Paper Title...
   2. Second Paper Title...
...

=== 第 1 次滚动 ===
🔄 开始受控滚动（不超过一屏，避免跳过内容）...
✅ 受控滚动完成，页面已安全移动到新位置
⏱️ 停顿等待页面稳定...
📋 开始收集当前页面项目...
🆕 发现 3 个新项目:
...
```

### 测试结果汇总
```
🎯 测试结果汇总:
⏱️ 耗时: 120 秒
📊 预期数量: 79
📋 实际收集: 75
📈 收集率: 95%
✅ 测试通过！收集率 95% >= 90%
```

### 详细报告
```
📄 测试报告:
测试状态: PASS
预期数量: 79
实际收集: 75
收集率: 95%
```

## 🔧 配置选项

### 测试成功标准
- **PASS**: 收集率 >= 90%
- **PARTIAL**: 收集率 >= 80%
- **FAIL**: 收集率 < 80%

### 滚动控制
- 最大滚动次数：动态计算（预期文章数 ÷ 3）
- 每次滚动距离：不超过一屏的 60-80%
- 滚动后等待时间：2.5秒
- 连续无新内容重试：3次

### 浏览器设置
- **headless**: false（可观察测试过程）
- **viewport**: 1920x1080
- **反检测措施**: 启用

## 🐛 故障排除

### 1. 收集率过低
```
⚠️ 收集数量可能不完整，预期 79，实际 45
```

**可能原因：**
- 页面加载不完整
- AI提取失败
- 网络问题

**解决方案：**
- 增加页面等待时间
- 检查网络连接
- 验证AI配置

### 2. 滚动停止过早
```
⚠️ 达到最大滚动次数限制 (27)，可能未收集完所有文章
```

**可能原因：**
- 页面内容加载缓慢
- 虚拟列表渲染问题

**解决方案：**
- 检查页面是否完全加载
- 增加滚动等待时间

### 3. API调用失败
```
❌ 测试执行失败: OpenAI API error
```

**解决方案：**
- 检查API密钥设置
- 验证网络连接
- 确认API配额

## 📝 测试报告

测试完成后，会在控制台输出详细的测试报告，包括：

1. **统计信息**
   - 预期文章数量
   - 实际收集数量
   - 收集成功率
   - 测试耗时

2. **收集的论文列表**
   - 论文标题
   - 作者信息
   - 详情页链接

3. **测试状态**
   - PASS/PARTIAL/FAIL
   - 具体的成功率

## 🔗 与主程序的区别

| 功能         | 测试文件     | 主程序   |
| ------------ | ------------ | -------- |
| 收集论文列表 | ✅            | ✅        |
| 进入详情页   | ❌            | ✅        |
| 提取摘要     | ❌            | ✅        |
| 翻译功能     | ❌            | ✅        |
| 保存文件     | ❌            | ✅        |
| 运行速度     | 快速         | 慢速     |
| 测试目的     | 验证收集功能 | 完整爬取 |

## 💡 使用建议

1. **在开发时**：使用测试文件快速验证收集逻辑
2. **在部署前**：运行测试确保功能正常
3. **在调试时**：观察滚动和收集过程
4. **在优化时**：对比不同配置的收集效果

## 🎛️ 高级用法

### 批量测试多个页面
```typescript
const testUrls = [
  'https://programs.sigchi.org/chi/2025/program/content/papers',
  'https://programs.sigchi.org/cscw/2024/program/content/papers',
];

for (const url of testUrls) {
  await tester.navigateToSearchResults(url);
  const result = await tester.testPaperCollection('test');
  console.log(`${url}: ${result.collectionRate}%`);
}
```

### 自定义成功标准
```typescript
// 修改测试成功标准
const customSuccessRate = 85; // 85% 为通过标准
if (testResult.collectionRate >= customSuccessRate) {
  logger.info(`✅ 测试通过！`);
}
``` 