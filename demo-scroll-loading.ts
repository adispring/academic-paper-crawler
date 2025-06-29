#!/usr/bin/env npx ts-node
/**
 * 分页滚动加载功能演示脚本
 * 演示如何使用新的滚动加载功能获取所有搜索结果
 */

import { AcademicPaperCrawler } from './src/crawler';
import { logger } from './src/utils';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function demonstrateScrollLoading() {
  logger.info('=== 分页滚动加载功能演示 ===');

  // 配置对比：禁用滚动 vs 启用滚动
  const configWithoutScroll = {
    outputPath: './output',
    outputFormat: 'json' as const,
    headless: true,
    scrollConfig: {
      enabled: false, // 禁用滚动
      maxScrolls: 0,
      maxRetries: 0,
      scrollDelay: 0,
      detectLoadMore: false,
    },
  };

  const configWithScroll = {
    outputPath: './output',
    outputFormat: 'json' as const,
    headless: true,
    scrollConfig: {
      enabled: true, // 启用滚动
      maxScrolls: 15, // 最大滚动15次
      maxRetries: 3, // 连续3次无新内容则停止
      scrollDelay: 2000, // 滚动间隔2秒
      detectLoadMore: true, // 检测"加载更多"按钮
    },
  };

  const keyword = 'bias';

  try {
    // 第一轮：不启用滚动加载（仅首屏）
    logger.info('\n=== 第一轮测试：禁用滚动加载（仅首屏结果） ===');
    const crawlerWithoutScroll = new AcademicPaperCrawler(configWithoutScroll);
    const papersWithoutScroll = await crawlerWithoutScroll.searchPapers(
      keyword
    );
    const statusWithoutScroll = crawlerWithoutScroll.getStatus();
    await crawlerWithoutScroll.close();

    logger.info(`不启用滚动 - 找到论文数量: ${papersWithoutScroll.length}`);
    logger.info(
      `处理状态: 成功 ${statusWithoutScroll.successful}, 失败 ${statusWithoutScroll.failed}`
    );

    // 第二轮：启用滚动加载（获取所有结果）
    logger.info('\n=== 第二轮测试：启用滚动加载（获取所有结果） ===');
    const crawlerWithScroll = new AcademicPaperCrawler(configWithScroll);
    const papersWithScroll = await crawlerWithScroll.searchPapers(keyword);
    const statusWithScroll = crawlerWithScroll.getStatus();
    await crawlerWithScroll.close();

    logger.info(`启用滚动 - 找到论文数量: ${papersWithScroll.length}`);
    logger.info(
      `处理状态: 成功 ${statusWithScroll.successful}, 失败 ${statusWithScroll.failed}`
    );

    // 对比结果
    logger.info('\n=== 结果对比 ===');
    const improvement = papersWithScroll.length - papersWithoutScroll.length;
    const improvementPercentage =
      papersWithoutScroll.length > 0
        ? ((improvement / papersWithoutScroll.length) * 100).toFixed(1)
        : 'N/A';

    logger.info(`首屏结果: ${papersWithoutScroll.length} 篇论文`);
    logger.info(`滚动加载后: ${papersWithScroll.length} 篇论文`);
    logger.info(`增加数量: ${improvement} 篇论文`);
    logger.info(`提升幅度: ${improvementPercentage}%`);

    if (improvement > 0) {
      logger.info(`✅ 滚动加载功能显著增加了搜索结果数量！`);

      // 保存结果进行对比
      await crawlerWithScroll.saveResults(
        papersWithoutScroll,
        `${keyword}-without-scroll`
      );
      await crawlerWithScroll.saveResults(
        papersWithScroll,
        `${keyword}-with-scroll`
      );

      logger.info('\n结果已保存到output目录，可以对比两个文件查看差异');
    } else {
      logger.info('⚠️  当前页面可能没有分页内容，或者网络条件限制了滚动加载');
    }
  } catch (error) {
    logger.error(`演示过程中出错: ${(error as Error).message}`);
  }
}

// 运行演示
demonstrateScrollLoading().catch((error) => {
  logger.error(`演示失败: ${error.message}`);
  process.exit(1);
});

// 使用说明
logger.info(`
=== 滚动加载功能使用说明 ===

1. 基础使用（默认启用滚动）：
   npx ts-node src/index.ts search -k "machine learning"

2. 禁用滚动加载（仅首屏）：
   npx ts-node src/index.ts search -k "AI" --no-scroll

3. 自定义滚动参数：
   npx ts-node src/index.ts search -k "HCI" --max-scrolls 10 --scroll-delay 1500

4. 结合其他功能使用：
   npx ts-node src/index.ts search -k "deep learning" \\
     --browser-use --translate --max-scrolls 15

配置说明：
- --no-scroll: 禁用滚动，仅获取首屏结果
- --max-scrolls <数量>: 最大滚动次数（默认20）
- --scroll-delay <毫秒>: 滚动间隔时间（默认2000ms）

技术特性：
✓ 智能检测页面加载状态
✓ 自动识别"加载更多"按钮
✓ 防止无限循环的安全机制
✓ 支持多种分页模式（滚动加载、按钮点击）
✓ 与Browser-Use智能提取完美结合

注意事项：
- 滚动加载会增加爬取时间，但能获得更全面的结果
- 建议根据实际需要调整最大滚动次数
- 网络不稳定时可以增加滚动延迟时间
- 某些网站可能有反爬机制，请适度使用
`);
