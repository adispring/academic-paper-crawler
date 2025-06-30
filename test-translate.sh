#!/bin/bash

# CSV 摘要翻译测试脚本

echo "🧪 CSV 摘要翻译功能测试"
echo "======================"
echo ""

# 检查是否设置了 API Key
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

# 检查测试文件
TEST_FILE="output/papers--2025-06-30T12-01-23-287Z.csv"

if [ ! -f "$TEST_FILE" ]; then
    echo "❌ 测试文件不存在: $TEST_FILE"
    echo ""
    echo "💡 请确保存在 CSV 文件，或修改 TEST_FILE 变量指向正确的文件"
    echo ""
    echo "📋 当前目录下的 CSV 文件："
    find . -name "*.csv" -type f | head -5
    exit 1
fi

echo "🔑 使用 API Key: ${OPENAI_API_KEY:0:10}..."
if [ -n "$OPENAI_BASE_URL" ]; then
    echo "🌐 使用自定义 API URL: $OPENAI_BASE_URL"
fi
echo "📁 测试文件: $TEST_FILE"
echo ""

# 确认继续
read -p "是否继续运行翻译测试？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 测试已取消"
    exit 1
fi

echo "🚀 开始运行翻译测试..."
echo ""

# 运行翻译脚本
npx tsx translate-csv-abstracts.ts "$TEST_FILE"

echo ""
echo "✅ 测试完成"

# 检查输出文件
OUTPUT_FILE="${TEST_FILE%.*}_translated.csv"
if [ -f "$OUTPUT_FILE" ]; then
    echo "📊 输出文件已生成: $OUTPUT_FILE"
    echo ""
    echo "📝 输出文件头部预览："
    head -3 "$OUTPUT_FILE"
    echo ""
    echo "📈 文件大小对比："
    echo "   原文件: $(wc -c < "$TEST_FILE") 字节"
    echo "   译文件: $(wc -c < "$OUTPUT_FILE") 字节"
else
    echo "❌ 输出文件未生成"
fi

echo ""
echo "🎉 测试流程完成！" 