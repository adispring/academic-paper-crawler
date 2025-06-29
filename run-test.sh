#!/bin/bash

# 论文收集功能测试启动脚本
# 使用方法：./run-test.sh "测试URL" [搜索关键词]

echo "🧪 论文收集功能测试"
echo "===================="

# 检查是否提供了测试URL
if [ -z "$1" ]; then
    echo "❌ 错误：未提供测试URL"
    echo ""
    echo "💡 使用方法："
    echo "   ./run-test.sh \"测试URL\" [搜索关键词]"
    echo ""
    echo "📋 示例："
    echo "   ./run-test.sh \"https://dblp.org/search?q=machine+learning\" \"machine learning\""
    echo "   ./run-test.sh \"https://arxiv.org/search/?query=deep+learning&searchtype=all\""
    echo ""
    echo "🌐 常用测试网站："
    echo "   - DBLP: https://dblp.org/search?q=your-keyword"
    echo "   - arXiv: https://arxiv.org/search/?query=your-keyword&searchtype=all"
    echo "   - Google Scholar: https://scholar.google.com/scholar?q=your-keyword"
    exit 1
fi

# 检查OPENAI_API_KEY环境变量
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ 错误：未设置 OPENAI_API_KEY 环境变量"
    echo ""
    echo "💡 请先设置你的 OpenAI API Key："
    echo "   export OPENAI_API_KEY=\"your-api-key-here\""
    echo ""
    echo "🔑 如果使用其他服务，也可以设置自定义URL："
    echo "   export OPENAI_BASE_URL=\"https://your-custom-api-url\""
    exit 1
fi

# 设置测试参数
export TEST_URL="$1"
export SEARCH_KEYWORD="${2:-test}"

echo "🔑 使用 API Key: ${OPENAI_API_KEY:0:10}..."
if [ -n "$OPENAI_BASE_URL" ]; then
    echo "🌐 使用自定义 API URL: $OPENAI_BASE_URL"
fi
echo "🔗 测试URL: $TEST_URL"
echo "🔍 搜索关键词: $SEARCH_KEYWORD"
echo ""

# 确认继续
read -p "是否继续运行测试？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 测试已取消"
    exit 1
fi

echo "🚀 开始运行测试..."
echo ""

# 运行测试
npx tsx test-paper-collection.ts "$TEST_URL"

echo ""
echo "✅ 测试完成" 