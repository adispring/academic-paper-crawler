#!/usr/bin/env node

import * as dotenv from 'dotenv';
dotenv.config();

import { AcademicPaperCrawler } from './src/crawler';
import { CrawlerConfig } from './src/types';
import { logger } from './src/utils';

/**
 * Browser-Use 功能演示
 * 这个演示展示了Browser-Use如何智能地处理学术论文爬取任务
 */
async function demoBrowserUse() {
  console.log('🤖 Browser-Use 智能浏览器操作演示');
  console.log('=====================================\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ 请先设置 OPENAI_API_KEY 环境变量');
    process.exit(1);
  }

  // 演示不同的Browser-Use模式
  const modes = [
    {
      name: '混合模式 (Hybrid)',
      mode: 'hybrid' as const,
      description: '结合传统方法和Browser-Use的优势，推荐用于大多数场景',
      emoji: '⚖️',
    },
    {
      name: 'Browser-Use专用模式',
      mode: 'browser-use-only' as const,
      description: '完全依赖AI理解页面，适合复杂或动态网站',
      emoji: '🧠',
    },
    {
      name: '传统专用模式',
      mode: 'traditional-only' as const,
      description: '仅使用CSS选择器，适合简单稳定的网站结构',
      emoji: '⚙️',
    },
  ];

  for (const { name, mode, description, emoji } of modes) {
    console.log(`\n${emoji} 演示模式: ${name}`);
    console.log(`📝 说明: ${description}`);
    console.log('----------------------------------------');

    try {
      const config: Partial<CrawlerConfig> = {
        outputPath: './output',
        outputFormat: 'json',
        headless: true, // 设置为false可以观看Browser-Use操作过程
        timeout: 30000,
        aiConfig: {
          enabled: true,
          model: 'gpt-4o-mini',
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL,
          temperature: 0.2,
          maxTokens: 1500,
          analysisTypes: ['summarize' as any],
          useBrowserUse: mode !== 'traditional-only',
          browserUseMode: mode,
          enableExtraction: true,
          extractionMode: 'fallback',
        },
      };

      const crawler = new AcademicPaperCrawler(config);

      const startTime = Date.now();
      const keyword = 'AI';

      console.log(`🔍 开始搜索关键词: "${keyword}"`);

      const papers = await crawler.searchPapers(keyword);
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      console.log(`✅ 搜索完成! 用时: ${duration}秒`);
      console.log(`📊 找到论文: ${papers.length} 篇`);

      if (papers.length > 0) {
        console.log(`\n📑 第一篇论文示例:`);
        const firstPaper = papers[0];
        console.log(`   标题: ${firstPaper.title.substring(0, 80)}...`);
        console.log(`   作者: ${firstPaper.authors.slice(0, 3).join(', ')}`);
        console.log(`   摘要: ${firstPaper.abstract.substring(0, 150)}...`);

        if (firstPaper.aiAnalysis) {
          console.log(
            `   🤖 AI分析: ${firstPaper.aiAnalysis.summary?.substring(
              0,
              100
            )}...`
          );
        }
      }

      const status = crawler.getStatus();
      console.log(`\n📈 统计信息:`);
      console.log(`   - 总计发现: ${status.totalFound}`);
      console.log(`   - 成功提取: ${status.successful}`);
      console.log(`   - 提取失败: ${status.failed}`);
      console.log(
        `   - 成功率: ${
          status.totalFound > 0
            ? ((status.successful / status.totalFound) * 100).toFixed(1)
            : 0
        }%`
      );

      await crawler.close();
    } catch (error) {
      console.error(`❌ ${name} 演示失败:`, (error as Error).message);
    }
  }

  console.log('\n🎉 Browser-Use 演示完成!');
  console.log('\n💡 要观察Browser-Use的实际操作过程，请:');
  console.log('   1. 将配置中的 headless 设置为 false');
  console.log('   2. 使用 browser-use-only 模式');
  console.log('   3. 你将看到AI智能地与浏览器交互');

  console.log('\n📖 更多信息请查看:');
  console.log('   - AI_USAGE.md: 详细的AI功能使用指南');
  console.log('   - test-browser-use.ts: 完整的功能测试');
}

// 运行演示
if (require.main === module) {
  demoBrowserUse().catch((error) => {
    console.error(`💥 演示过程中发生错误: ${error.message}`);
    process.exit(1);
  });
}

export { demoBrowserUse };
