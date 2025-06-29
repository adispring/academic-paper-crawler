import { AcademicPaperCrawler } from './src/crawler';
import { CrawlerConfig } from './src/types';

async function testVirtualListOptimization() {
  console.log('🧪 开始测试虚拟列表优化功能...\n');

  // 配置1: 传统滚动策略测试
  const traditionalConfig: Partial<CrawlerConfig> = {
    headless: false,
    aiConfig: {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1000,
      enabled: true,
      useBrowserUse: false, // 禁用Browser-Use，测试传统爬虫
    },
    scrollConfig: {
      enabled: true,
      maxScrolls: 10,
      maxRetries: 3,
      scrollDelay: 1500,
      detectLoadMore: true,
      humanLike: true,
      scrollStepsMin: 2,
      scrollStepsMax: 4,
      stepDelayMin: 500,
      stepDelayMax: 1000,
      randomBackscroll: false,
      backscrollChance: 0.2,
      // 禁用虚拟列表优化
      virtualListOptimization: false,
      virtualListScrollDelay: 3500,
      virtualListMaxRetries: 6,
      virtualListCollectionThreshold: 0.85,
    },
  };

  // 配置2: 虚拟列表优化测试
  const virtualListConfig: Partial<CrawlerConfig> = {
    headless: false,
    aiConfig: {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1000,
      enabled: true,
      useBrowserUse: false, // 禁用Browser-Use，测试传统爬虫的虚拟列表优化
    },
    scrollConfig: {
      enabled: true,
      maxScrolls: 25,
      maxRetries: 5,
      scrollDelay: 2000,
      detectLoadMore: true,
      humanLike: true,
      scrollStepsMin: 3,
      scrollStepsMax: 6,
      stepDelayMin: 800,
      stepDelayMax: 1800,
      randomBackscroll: true,
      backscrollChance: 0.3,
      // 启用虚拟列表优化
      virtualListOptimization: true,
      virtualListScrollDelay: 4000, // 4秒延迟
      virtualListMaxRetries: 8, // 更多重试次数
      virtualListCollectionThreshold: 0.9, // 90%阈值
    },
  };

  // 配置3: Browser-Use + 虚拟列表优化
  const browserUseVirtualConfig: Partial<CrawlerConfig> = {
    headless: false,
    aiConfig: {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1000,
      enabled: true,
      useBrowserUse: true, // 启用Browser-Use
      browserUseMode: 'hybrid',
    },
    scrollConfig: {
      enabled: true,
      maxScrolls: 20,
      maxRetries: 4,
      scrollDelay: 2500,
      detectLoadMore: true,
      humanLike: true,
      scrollStepsMin: 3,
      scrollStepsMax: 6,
      stepDelayMin: 800,
      stepDelayMax: 1800,
      randomBackscroll: true,
      backscrollChance: 0.3,
      // 虚拟列表优化
      virtualListOptimization: true,
      virtualListScrollDelay: 3500,
      virtualListMaxRetries: 6,
      virtualListCollectionThreshold: 0.85,
    },
  };

  const testKeyword = 'bias';
  const testConfigs = [
    { name: '传统滚动策略 (虚拟列表优化:关闭)', config: traditionalConfig },
    { name: '虚拟列表优化 (传统爬虫)', config: virtualListConfig },
    { name: 'Browser-Use + 虚拟列表优化', config: browserUseVirtualConfig },
  ];

  for (const { name, config } of testConfigs) {
    console.log(`\n🔬 测试配置: ${name}`);
    console.log('━'.repeat(60));

    const startTime = Date.now();
    const crawler = new AcademicPaperCrawler(config);

    try {
      const papers = await crawler.searchPapers(testKeyword);
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      console.log(`\n📊 ${name} - 结果统计:`);
      console.log(`  ✅ 找到论文数量: ${papers.length}`);
      console.log(`  ⏱️  处理时间: ${duration} 秒`);
      console.log(
        `  📈 平均处理速度: ${
          papers.length > 0 ? Math.round(papers.length / (duration / 60)) : 0
        } 篇/分钟`
      );

      if (papers.length > 0) {
        console.log(`\n📝 前3个论文示例:`);
        papers.slice(0, 3).forEach((paper, index) => {
          console.log(
            `  ${index + 1}. 标题: "${paper.title.substring(0, 60)}${
              paper.title.length > 60 ? '...' : ''
            }"`
          );
          console.log(
            `     作者: ${paper.authors.slice(0, 3).join(', ')}${
              paper.authors.length > 3 ? '...' : ''
            }`
          );
          console.log(`     链接: ${paper.paperLink ? '✅ 有' : '❌ 无'}`);
          console.log(
            `     摘要: ${paper.abstract ? '✅ 有' : '❌ 无'} (${
              paper.abstract?.length || 0
            } 字符)`
          );
          console.log('');
        });
      }

      // 保存结果
      if (papers.length > 0) {
        const filename = await crawler.saveResults(
          papers,
          `${testKeyword}-${name.replace(/[^a-zA-Z0-9]/g, '-')}`
        );
        console.log(`  📁 结果已保存: ${filename}`);
      }
    } catch (error) {
      console.error(`❌ ${name} 测试失败:`, error);
    } finally {
      await crawler.close();
    }

    console.log('\n' + '─'.repeat(60));
  }

  console.log('\n🎯 虚拟列表优化测试完成!');
  console.log('\n📋 测试总结:');
  console.log('1. 传统滚动策略: 适用于常规分页网站');
  console.log('2. 虚拟列表优化: 专门针对虚拟滚动网站优化');
  console.log('3. Browser-Use混合模式: AI智能操作 + 虚拟列表优化');
  console.log('\n比较重点:');
  console.log('- 论文数量: 虚拟列表优化应该能找到更多论文');
  console.log('- 处理时间: 虚拟列表优化可能需要更长时间但更准确');
  console.log('- 链接质量: Browser-Use模式应该有更高的链接提取成功率');
}

// 执行测试
if (require.main === module) {
  testVirtualListOptimization().catch(console.error);
}

export { testVirtualListOptimization };
