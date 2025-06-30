#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import path from 'path';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * CSV 论文数据接口
 */
interface PaperRecord {
  [key: string]: string;
}

/**
 * CSV 摘要翻译器
 */
class CSVAbstractTranslator {
  private llm: ChatOpenAI;
  private processedCount = 0;
  private translatedCount = 0;
  private errorCount = 0;

  constructor() {
    // 检查 API Key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('❌ 错误：未设置 OPENAI_API_KEY 环境变量');
      console.log('💡 请设置环境变量：export OPENAI_API_KEY="your-api-key"');
      process.exit(1);
    }

    // 初始化 OpenAI 模型
    this.llm = new ChatOpenAI({
      apiKey: apiKey,
      modelName: process.env.AI_MODEL || 'gpt-4o-mini',
      temperature: parseFloat(process.env.AI_TEMPERATURE || '0.1'),
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
      ...(process.env.OPENAI_BASE_URL && {
        configuration: {
          baseURL: process.env.OPENAI_BASE_URL,
        },
      }),
    });

    console.log(`🔑 使用 API Key: ${apiKey.substring(0, 10)}...`);
    console.log(`🤖 使用模型: ${process.env.AI_MODEL || 'gpt-4o-mini'}`);
    if (process.env.OPENAI_BASE_URL) {
      console.log(`🌐 API 基础URL: ${process.env.OPENAI_BASE_URL}`);
    }
  }

  /**
   * 简单的 CSV 解析器
   */
  private parseCSV(csvContent: string): PaperRecord[] {
    const lines = csvContent.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return [];

    const headers = this.parseCSVLine(lines[0]);
    const records: PaperRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const record: PaperRecord = {};
        headers.forEach((header, index) => {
          record[header] = values[index] || '';
        });
        records.push(record);
      }
    }

    return records;
  }

  /**
   * 解析 CSV 行（处理引号和逗号）
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // 转义的引号
          current += '"';
          i += 2;
        } else {
          // 开始或结束引号
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // 分隔符
        result.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }

    result.push(current);
    return result;
  }

  /**
   * 转换为 CSV 字符串
   */
  private toCSV(records: PaperRecord[]): string {
    if (records.length === 0) return '';

    const headers = Object.keys(records[0]);
    const csvLines: string[] = [];

    // 添加头部
    csvLines.push(
      headers.map((header) => this.escapeCSVValue(header)).join(',')
    );

    // 添加数据行
    records.forEach((record) => {
      const values = headers.map((header) =>
        this.escapeCSVValue(record[header] || '')
      );
      csvLines.push(values.join(','));
    });

    return csvLines.join('\n');
  }

  /**
   * 转义 CSV 值（处理引号和逗号）
   */
  private escapeCSVValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      // 需要用引号包围，并转义内部的引号
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * 检测文本是否为中文
   */
  private isChinese(text: string): boolean {
    if (!text || text.trim().length === 0) return false;

    // 统计中文字符数量
    const chineseRegex = /[\u4e00-\u9fff]/g;
    const chineseMatches = text.match(chineseRegex);
    const chineseCount = chineseMatches ? chineseMatches.length : 0;

    // 去除标点符号和空格后的总字符数
    const totalChars = text.replace(/[\s\p{P}]/gu, '').length;

    // 如果中文字符占比超过30%，认为是中文文本
    const chineseRatio = totalChars > 0 ? chineseCount / totalChars : 0;

    return chineseRatio > 0.3;
  }

  /**
   * 检查摘要是否已包含中文翻译
   */
  private hasChineseTranslation(abstract: string): boolean {
    // 查找是否包含"中文翻译："或类似的标记
    const translationMarkers = [
      '中文翻译：',
      '中文翻译:',
      '翻译：',
      '翻译:',
      '中文：',
      '中文:',
      'Chinese Translation:',
      'Translation:',
    ];

    return translationMarkers.some((marker) =>
      abstract.toLowerCase().includes(marker.toLowerCase())
    );
  }

  /**
   * 使用 OpenAI 翻译摘要
   */
  private async translateAbstract(abstract: string): Promise<string> {
    const prompt = `请将以下英文学术论文摘要翻译成中文，要求：
1. 保持学术性和专业性
2. 准确传达原文意思
3. 使用流畅的中文表达
4. 保留专业术语的准确性

英文摘要：
${abstract}

请只返回中文翻译，不要包含其他说明文字。`;

    try {
      const message = new HumanMessage(prompt);
      const response = await this.llm.invoke([message]);
      return response.content.toString().trim();
    } catch (error) {
      console.error('翻译失败:', error);
      throw new Error(`翻译失败: ${error}`);
    }
  }

  /**
   * 处理单个摘要
   */
  private async processAbstract(abstract: string): Promise<string> {
    this.processedCount++;

    // 检查是否为空
    if (!abstract || abstract.trim().length === 0) {
      console.log(`📄 第 ${this.processedCount} 条: 空摘要，跳过`);
      return abstract;
    }

    // 检查是否已经包含中文翻译
    if (this.hasChineseTranslation(abstract)) {
      console.log(`📄 第 ${this.processedCount} 条: 已包含中文翻译，跳过`);
      return abstract;
    }

    // 检查是否为中文
    if (this.isChinese(abstract)) {
      console.log(`📄 第 ${this.processedCount} 条: 已是中文，跳过`);
      return abstract;
    }

    // 翻译非中文摘要
    try {
      console.log(`🔄 第 ${this.processedCount} 条: 正在翻译...`);
      console.log(`   原文: ${abstract.substring(0, 100)}...`);

      const translation = await this.translateAbstract(abstract);
      this.translatedCount++;

      // 合并原文和翻译，中间空一行
      const combinedAbstract = `${abstract}\n\n中文翻译：\n${translation}`;

      console.log(`✅ 第 ${this.processedCount} 条: 翻译完成`);
      console.log(`   译文: ${translation.substring(0, 100)}...`);

      return combinedAbstract;
    } catch (error) {
      this.errorCount++;
      console.error(`❌ 第 ${this.processedCount} 条: 翻译失败 - ${error}`);
      return abstract; // 翻译失败时返回原文
    }
  }

  /**
   * 翻译 CSV 文件
   */
  async translateCSV(inputFile: string, outputFile?: string): Promise<void> {
    // 检查输入文件
    if (!existsSync(inputFile)) {
      throw new Error(`输入文件不存在: ${inputFile}`);
    }

    // 确定输出文件名
    if (!outputFile) {
      const ext = path.extname(inputFile);
      const basename = path.basename(inputFile, ext);
      const dirname = path.dirname(inputFile);
      outputFile = path.join(dirname, `${basename}_translated${ext}`);
    }

    console.log(`📂 输入文件: ${inputFile}`);
    console.log(`📂 输出文件: ${outputFile}`);
    console.log('');

    try {
      // 读取 CSV 文件
      console.log('📖 正在读取 CSV 文件...');
      const csvContent = readFileSync(inputFile, 'utf-8');

      // 解析 CSV
      const records = this.parseCSV(csvContent);

      console.log(`📊 找到 ${records.length} 条记录`);
      console.log('');

      // 查找摘要字段
      const abstractField = Object.keys(records[0]).find(
        (key) => key.includes('摘要') || key.toLowerCase().includes('abstract')
      );

      if (!abstractField) {
        throw new Error(
          '未找到摘要字段，请确保CSV文件包含"摘要"或"abstract"字段'
        );
      }

      console.log(`🔍 找到摘要字段: ${abstractField}`);
      console.log('');

      // 处理每条记录
      for (let i = 0; i < records.length; i++) {
        const record = records[i];

        // 添加延迟以避免 API 限制
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1秒延迟
        }

        // 翻译摘要
        record[abstractField] = await this.processAbstract(
          record[abstractField]
        );

        // 显示进度
        const progress = (((i + 1) / records.length) * 100).toFixed(1);
        console.log(`📈 进度: ${progress}% (${i + 1}/${records.length})`);
        console.log('');
      }

      // 生成新的 CSV
      console.log('💾 正在保存翻译结果...');
      const newCsvContent = this.toCSV(records);
      writeFileSync(outputFile, newCsvContent, 'utf-8');

      // 显示统计信息
      console.log('✅ 翻译完成！');
      console.log('');
      console.log('📊 统计信息:');
      console.log(`   处理总数: ${this.processedCount}`);
      console.log(`   翻译成功: ${this.translatedCount}`);
      console.log(`   翻译失败: ${this.errorCount}`);
      console.log(
        `   跳过数量: ${
          this.processedCount - this.translatedCount - this.errorCount
        }`
      );
      console.log(`   输出文件: ${outputFile}`);
    } catch (error) {
      console.error('❌ 处理失败:', error);
      throw error;
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🌍 CSV 摘要翻译工具');
  console.log('===================');
  console.log('');

  // 获取命令行参数
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方法:');
    console.log(
      '  npx tsx translate-csv-abstracts.ts <输入CSV文件> [输出CSV文件]'
    );
    console.log('');
    console.log('示例:');
    console.log(
      '  npx tsx translate-csv-abstracts.ts output/papers--2025-06-30T12-01-23-287Z.csv'
    );
    console.log(
      '  npx tsx translate-csv-abstracts.ts output/papers.csv output/papers_translated.csv'
    );
    console.log('');
    console.log('环境变量:');
    console.log('  OPENAI_API_KEY=your_api_key          # 必需');
    console.log('  OPENAI_BASE_URL=custom_api_endpoint  # 可选');
    console.log(
      '  AI_MODEL=gpt-4o-mini                 # 可选，默认 gpt-4o-mini'
    );
    console.log('  AI_TEMPERATURE=0.1                   # 可选，默认 0.1');
    console.log('  AI_MAX_TOKENS=2000                   # 可选，默认 2000');
    console.log('');
    console.log('功能特点:');
    console.log('  ✅ 自动检测中文内容，仅翻译非中文摘要');
    console.log('  ✅ 保留原摘要，在后面空一行添加中文翻译');
    console.log('  ✅ 避免重复翻译已包含中文翻译的条目');
    console.log('  ✅ 错误处理和进度显示');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputFile = args[1];

  try {
    const translator = new CSVAbstractTranslator();
    await translator.translateCSV(inputFile, outputFile);
  } catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(console.error);
}
