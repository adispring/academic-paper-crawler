#!/usr/bin/env npx ts-node

import { AcademicPaperCrawler } from './src/crawler';
import { CrawlerConfig } from './src/types';
import { logger } from './src/utils';

/**
 * 人类式滚动演示脚本
 *
 * 此脚本展示如何使用新的人类式滚动功能：
 * 1. 模拟真实用户的滚动行为
 * 2. 渐进式加载页面内容
 * 3. 随机停顿和回看行为
 * 4. 智能检测页面加载状态
 */

async function demonstrateHumanScroll() {
  logger.info('=== 人类式滚动功能演示 ===\n');

  // 1. 默认人类式滚动配置
  logger.info('🚀 演示1: 默认人类式滚动');
  logger.info('配置: 启用人类式滚动, 3-6步, 800-1800ms延迟, 30%回看概率');

  const defaultConfig: Partial<CrawlerConfig> = {
    headless: false, // 显示浏览器窗口，便于观察滚动行为
    outputPath: './output',
    scrollConfig: {
      enabled: true,
      maxScrolls: 10,
      maxRetries: 3,
      scrollDelay: 2000,
      detectLoadMore: true,
      // 人类式滚动配置
      humanLike: true,
      scrollStepsMin: 3,
      scrollStepsMax: 6,
      stepDelayMin: 800,
      stepDelayMax: 1800,
      randomBackscroll: true,
      backscrollChance: 0.3,
    },
  };

  const crawler1 = new AcademicPaperCrawler(defaultConfig);

  try {
    logger.info('开始搜索 "machine learning"...');
    const papers1 = await crawler1.searchPapers('machine learning');
    logger.info(`✅ 找到 ${papers1.length} 篇论文\n`);
  } catch (error) {
    logger.error(`❌ 搜索失败: ${(error as Error).message}\n`);
  } finally {
    await crawler1.close();
  }

  // 等待用户观察
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 2. 快速人类式滚动配置
  logger.info('🚀 演示2: 快速人类式滚动');
  logger.info('配置: 更少步数, 更短延迟, 更低回看概率');

  const fastConfig: Partial<CrawlerConfig> = {
    headless: false,
    outputPath: './output',
    scrollConfig: {
      enabled: true,
      maxScrolls: 10,
      maxRetries: 3,
      scrollDelay: 1500,
      detectLoadMore: true,
      // 快速人类式滚动
      humanLike: true,
      scrollStepsMin: 2,
      scrollStepsMax: 4,
      stepDelayMin: 400,
      stepDelayMax: 800,
      randomBackscroll: true,
      backscrollChance: 0.15, // 更低的回看概率
    },
  };

  const crawler2 = new AcademicPaperCrawler(fastConfig);

  try {
    logger.info('开始搜索 "AI ethics"...');
    const papers2 = await crawler2.searchPapers('AI ethics');
    logger.info(`✅ 找到 ${papers2.length} 篇论文\n`);
  } catch (error) {
    logger.error(`❌ 搜索失败: ${(error as Error).message}\n`);
  } finally {
    await crawler2.close();
  }

  // 等待用户观察
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 3. 慢速深度滚动配置
  logger.info('🚀 演示3: 慢速深度滚动');
  logger.info('配置: 更多步数, 更长延迟, 更高回看概率');

  const deepConfig: Partial<CrawlerConfig> = {
    headless: false,
    outputPath: './output',
    scrollConfig: {
      enabled: true,
      maxScrolls: 15,
      maxRetries: 3,
      scrollDelay: 3000,
      detectLoadMore: true,
      // 深度人类式滚动
      humanLike: true,
      scrollStepsMin: 5,
      scrollStepsMax: 8,
      stepDelayMin: 1200,
      stepDelayMax: 2500,
      randomBackscroll: true,
      backscrollChance: 0.5, // 更高的回看概率
    },
  };

  const crawler3 = new AcademicPaperCrawler(deepConfig);

  try {
    logger.info('开始搜索 "neural networks"...');
    const papers3 = await crawler3.searchPapers('neural networks');
    logger.info(`✅ 找到 ${papers3.length} 篇论文\n`);
  } catch (error) {
    logger.error(`❌ 搜索失败: ${(error as Error).message}\n`);
  } finally {
    await crawler3.close();
  }

  // 4. 对比传统滚动
  logger.info('🚀 演示4: 传统快速滚动对比');
  logger.info('配置: 禁用人类式滚动，使用传统快速滚动');

  const traditionalConfig: Partial<CrawlerConfig> = {
    headless: false,
    outputPath: './output',
    scrollConfig: {
      enabled: true,
      maxScrolls: 10,
      maxRetries: 3,
      scrollDelay: 2000,
      detectLoadMore: true,
      // 禁用人类式滚动
      humanLike: false,
      scrollStepsMin: 1,
      scrollStepsMax: 1,
      stepDelayMin: 0,
      stepDelayMax: 0,
      randomBackscroll: false,
      backscrollChance: 0,
    },
  };

  const crawler4 = new AcademicPaperCrawler(traditionalConfig);

  try {
    logger.info('开始搜索 "computer vision"...');
    const papers4 = await crawler4.searchPapers('computer vision');
    logger.info(`✅ 找到 ${papers4.length} 篇论文\n`);
  } catch (error) {
    logger.error(`❌ 搜索失败: ${(error as Error).message}\n`);
  } finally {
    await crawler4.close();
  }

  logger.info('=== 演示完成 ===');
  logger.info('🎯 人类式滚动的优势：');
  logger.info('  • 更自然的滚动行为，不易被反爬虫检测');
  logger.info('  • 渐进式加载，给页面足够时间响应');
  logger.info('  • 随机性和回看行为模拟真实用户');
  logger.info('  • 智能等待，提高内容加载成功率');
  logger.info('\n💡 使用建议：');
  logger.info('  • 对于快速批量处理，可以使用较少步数和较短延迟');
  logger.info('  • 对于重要内容或反爬虫严格的网站，使用深度滚动配置');
  logger.info('  • 可以通过命令行参数灵活调整滚动行为');
}

// 展示命令行用法
function showCommandLineUsage() {
  logger.info('\n📋 命令行使用示例：\n');

  console.log('# 默认人类式滚动');
  console.log('npx ts-node src/index.ts search -k "machine learning"');
  console.log('');

  console.log('# 禁用人类式滚动，使用传统快速滚动');
  console.log('npx ts-node src/index.ts search -k "AI" --no-human-scroll');
  console.log('');

  console.log('# 自定义滚动参数');
  console.log('npx ts-node src/index.ts search -k "neural networks" \\');
  console.log('  --scroll-steps 2-4 \\');
  console.log('  --step-delay 500-1000 \\');
  console.log('  --backscroll-chance 0.2');
  console.log('');

  console.log('# 深度滚动模式');
  console.log('npx ts-node src/index.ts search -k "computer vision" \\');
  console.log('  --scroll-steps 6-10 \\');
  console.log('  --step-delay 1500-3000 \\');
  console.log('  --backscroll-chance 0.6 \\');
  console.log('  --max-scrolls 25');
  console.log('');

  console.log('# 结合Browser-Use的人类式滚动');
  console.log('npx ts-node src/index.ts search -k "bias" \\');
  console.log('  --browser-use \\');
  console.log('  --browser-use-mode hybrid \\');
  console.log('  --scroll-steps 4-6 \\');
  console.log('  --step-delay 1000-2000');
}

// 主函数
async function main() {
  try {
    // 检查是否只显示用法
    if (process.argv[2] === '--help' || process.argv[2] === '-h') {
      showCommandLineUsage();
      return;
    }

    // 运行演示
    await demonstrateHumanScroll();
    showCommandLineUsage();
  } catch (error) {
    logger.error('演示过程中出错:', error);
    process.exit(1);
  }
}

// 运行演示
if (require.main === module) {
  main();
}

export { demonstrateHumanScroll, showCommandLineUsage };
