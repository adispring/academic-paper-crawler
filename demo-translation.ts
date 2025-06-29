#!/usr/bin/env npx ts-node
/**
 * 摘要翻译功能演示脚本
 * 演示如何使用新的翻译功能
 */

import { AcademicPaperCrawler } from './src/crawler';
import { logger } from './src/utils';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function demonstrateTranslation() {
  logger.info('=== 摘要翻译功能演示 ===');

  // 演示配置：启用Browser-Use和翻译功能
  const config = {
    outputPath: './output',
    outputFormat: 'json' as const,
    headless: true,
    aiConfig: {
      enabled: true,
      model: 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      temperature: 0.3,
      maxTokens: 2000,

      // 启用所有功能
      enableExtraction: true,
      extractionMode: 'enhance' as const,
      useBrowserUse: true,
      browserUseMode: 'hybrid' as const,

      // 启用翻译功能
      enableTranslation: true,
      translationMode: 'non-chinese-only' as const,
    },
  };

  const crawler = new AcademicPaperCrawler(config);

  try {
    logger.info('开始搜索演示...');
    logger.info('配置说明：');
    logger.info('✓ Browser-Use智能提取已启用');
    logger.info('✓ 摘要翻译功能已启用（仅翻译非中文内容）');
    logger.info('');

    // 搜索包含英文摘要的论文
    const papers = await crawler.searchPapers('machine learning');

    if (papers.length > 0) {
      logger.info(`成功提取 ${papers.length} 篇论文`);

      // 展示翻译结果
      papers.slice(0, 2).forEach((paper, index) => {
        logger.info(`\n--- 论文 ${index + 1} ---`);
        logger.info(`标题: ${paper.title}`);
        logger.info(`作者: ${paper.authors.join(', ')}`);
        logger.info(`摘要:`);

        if (
          paper.abstract.includes('原文：') &&
          paper.abstract.includes('中文翻译：')
        ) {
          logger.info('✓ 摘要已翻译（包含原文和中文翻译）');
          console.log(paper.abstract);
        } else {
          logger.info('摘要内容：');
          console.log(paper.abstract);
        }

        if (paper.paperLink) {
          logger.info(`论文链接: ${paper.paperLink}`);
        }
      });

      // 保存结果
      const outputFile = await crawler.saveResults(papers, 'translation-demo');
      logger.info(`\n结果已保存到: ${outputFile}`);

      // 统计信息
      const translatedCount = papers.filter(
        (p) =>
          p.abstract.includes('原文：') && p.abstract.includes('中文翻译：')
      ).length;

      logger.info('\n=== 翻译统计 ===');
      logger.info(`总论文数: ${papers.length}`);
      logger.info(`翻译摘要数: ${translatedCount}`);
      logger.info(
        `未翻译数: ${papers.length - translatedCount} (可能已是中文或翻译失败)`
      );
    } else {
      logger.warn('未找到任何论文');
    }
  } catch (error) {
    logger.error(`演示过程中出错: ${(error as Error).message}`);
  } finally {
    await crawler.close();
  }
}

// 检查必要的环境变量
if (!process.env.OPENAI_API_KEY) {
  logger.error('请设置 OPENAI_API_KEY 环境变量');
  logger.info(`
=== 翻译功能使用说明 ===

1. 基础使用（启用翻译）：
   npx ts-node src/index.ts search -k "machine learning" --translate

2. 指定翻译模式：
   npx ts-node src/index.ts search -k "AI" --translate --translate-mode non-chinese-only

3. 结合Browser-Use使用：
   npx ts-node src/index.ts search -k "HCI" --browser-use --translate

4. 翻译模式说明：
   - always: 总是翻译所有摘要
   - non-chinese-only: 仅翻译非中文摘要（推荐）
   - disabled: 禁用翻译功能

5. 翻译结果格式：
   原文：
   [英文原始摘要内容]
   
   中文翻译：
   [中文翻译内容]

注意：
- 翻译功能需要消耗额外的API调用
- 建议使用non-chinese-only模式，避免重复翻译中文内容
- 翻译失败时会保留原始摘要内容
`);
  process.exit(1);
}

// 运行演示
demonstrateTranslation().catch((error) => {
  logger.error(`演示失败: ${error.message}`);
  process.exit(1);
});
