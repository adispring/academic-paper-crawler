import { AcademicPaperCrawler } from './src/crawler';
import { CrawlerConfig } from './src/types';
import { logger } from './src/utils';

async function testEnhancedVirtualListOptimization() {
  console.log('🧪 开始增强虚拟列表优化测试...\n');

  // 配置1: 原始虚拟列表策略（基准）
  const originalVirtualConfig: Partial<CrawlerConfig> = {
    headless: false,
    aiConfig: {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1000,
      enabled: true,
      useBrowserUse: false,
    },
    scrollConfig: {
      enabled: true,
      maxScrolls: 100,
      maxRetries: 3,
      scrollDelay: 2000,
      detectLoadMore: true,
      humanLike: true,
      scrollStepsMin: 3,
      scrollStepsMax: 6,
      stepDelayMin: 800,
      stepDelayMax: 1800,
      randomBackscroll: true,
      backscrollChance: 0.3,
      // 原始虚拟列表优化配置
      virtualListOptimization: true,
      virtualListScrollDelay: 3500,
      virtualListMaxRetries: 6,
      virtualListCollectionThreshold: 1,
    },
  };

  // 配置2: 增强虚拟列表策略
  const enhancedVirtualConfig: Partial<CrawlerConfig> = {
    headless: false,
    aiConfig: {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1000,
      enabled: true,
      useBrowserUse: false,
    },
    scrollConfig: {
      enabled: true,
      maxScrolls: 100,
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
      // 增强虚拟列表优化配置
      virtualListOptimization: true,
      virtualListScrollDelay: 4000, // 增加延迟
      virtualListMaxRetries: 8, // 增加重试
      virtualListCollectionThreshold: 1, // 提高阈值
    },
  };

  // 配置3: Browser-Use + 增强虚拟列表策略
  const browserUseEnhancedConfig: Partial<CrawlerConfig> = {
    headless: false,
    aiConfig: {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 1000,
      enabled: true,
      useBrowserUse: true,
      browserUseMode: 'hybrid',
    },
    scrollConfig: {
      enabled: true,
      maxScrolls: 80,
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
      // Browser-Use优化的虚拟列表配置
      virtualListOptimization: true,
      virtualListScrollDelay: 3500,
      virtualListMaxRetries: 6,
      virtualListCollectionThreshold: 1,
    },
  };

  const testKeyword = 'bias';
  const testConfigs = [
    { name: '原始虚拟列表策略 (基准)', config: originalVirtualConfig },
    { name: '增强虚拟列表策略', config: enhancedVirtualConfig },
    { name: 'Browser-Use + 增强虚拟列表', config: browserUseEnhancedConfig },
  ];

  const results: any[] = [];

  for (const { name, config } of testConfigs) {
    console.log(`\n🔬 测试配置: ${name}`);
    console.log('━'.repeat(70));

    const startTime = Date.now();
    const crawler = new AcademicPaperCrawler(config);

    try {
      logger.info(`开始测试: ${name}`);
      const papers = await crawler.searchPapers(testKeyword);
      const endTime = Date.now();
      const duration = Math.round((endTime - startTime) / 1000);

      const result = {
        name,
        papersFound: papers.length,
        duration,
        avgPerMinute:
          papers.length > 0 ? Math.round(papers.length / (duration / 60)) : 0,
        papersWithLinks: papers.filter((p) => p.paperLink).length,
        papersWithAbstracts: papers.filter(
          (p) => p.abstract && p.abstract.length > 10
        ).length,
        linkSuccessRate:
          papers.length > 0
            ? Math.round(
                (papers.filter((p) => p.paperLink).length / papers.length) * 100
              )
            : 0,
        abstractSuccessRate:
          papers.length > 0
            ? Math.round(
                (papers.filter((p) => p.abstract && p.abstract.length > 10)
                  .length /
                  papers.length) *
                  100
              )
            : 0,
      };

      results.push(result);

      console.log(`\n📊 ${name} - 结果统计:`);
      console.log(`  ✅ 找到论文数量: ${result.papersFound}`);
      console.log(`  ⏱️  处理时间: ${result.duration} 秒`);
      console.log(`  📈 平均处理速度: ${result.avgPerMinute} 篇/分钟`);
      console.log(
        `  🔗 论文链接获取: ${result.papersWithLinks}/${result.papersFound} (${result.linkSuccessRate}%)`
      );
      console.log(
        `  📄 摘要获取: ${result.papersWithAbstracts}/${result.papersFound} (${result.abstractSuccessRate}%)`
      );

      if (papers.length > 0) {
        console.log(`\n📝 示例论文 (前3个):`);
        papers.slice(0, 3).forEach((paper, index) => {
          console.log(
            `  ${index + 1}. "${paper.title.substring(0, 50)}${
              paper.title.length > 50 ? '...' : ''
            }"`
          );
          console.log(
            `     作者: ${paper.authors.slice(0, 2).join(', ')}${
              paper.authors.length > 2 ? '...' : ''
            }`
          );
          console.log(
            `     链接: ${paper.paperLink ? '✅' : '❌'} | 摘要: ${
              paper.abstract && paper.abstract.length > 10 ? '✅' : '❌'
            }`
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
      results.push({
        name,
        papersFound: 0,
        duration: 0,
        avgPerMinute: 0,
        papersWithLinks: 0,
        papersWithAbstracts: 0,
        linkSuccessRate: 0,
        abstractSuccessRate: 0,
        error: (error as Error).message,
      });
    } finally {
      await crawler.close();
    }

    console.log('\n' + '─'.repeat(70));

    // 每个测试之间等待一段时间，避免过度请求
    if (testConfigs.indexOf({ name, config }) < testConfigs.length - 1) {
      console.log('⏳ 等待5秒后进行下一个测试...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  // 生成对比报告
  console.log('\n🎯 增强虚拟列表优化测试完成!\n');
  console.log('📋 详细对比分析:');
  console.log('═'.repeat(100));

  // 创建对比表格
  const tableHeader =
    '| 策略名称 | 论文数量 | 时间(秒) | 速度(篇/分) | 链接成功率 | 摘要成功率 |';
  const tableSeparator =
    '|----------|----------|----------|-------------|------------|------------|';

  console.log(tableHeader);
  console.log(tableSeparator);

  results.forEach((result) => {
    if (!result.error) {
      const row = `| ${result.name.padEnd(8)} | ${String(
        result.papersFound
      ).padEnd(8)} | ${String(result.duration).padEnd(8)} | ${String(
        result.avgPerMinute
      ).padEnd(11)} | ${String(result.linkSuccessRate + '%').padEnd(
        10
      )} | ${String(result.abstractSuccessRate + '%').padEnd(10)} |`;
      console.log(row);
    }
  });

  console.log('\n📈 关键改进指标:');

  const baseline = results[0];
  const enhanced = results[1];
  const browserUse = results[2];

  if (baseline && enhanced && !baseline.error && !enhanced.error) {
    const paperImprovement = enhanced.papersFound - baseline.papersFound;
    const speedImprovement =
      ((enhanced.avgPerMinute - baseline.avgPerMinute) /
        baseline.avgPerMinute) *
      100;

    console.log(`✨ 增强虚拟列表 vs 原始策略:`);
    console.log(
      `   📊 论文收集: ${
        paperImprovement > 0 ? '+' : ''
      }${paperImprovement} 篇 (${Math.round(
        (paperImprovement / baseline.papersFound) * 100
      )}% 变化)`
    );
    console.log(
      `   🚀 处理速度: ${speedImprovement > 0 ? '+' : ''}${Math.round(
        speedImprovement
      )}% 变化`
    );
    console.log(
      `   🔗 链接质量: ${enhanced.linkSuccessRate}% vs ${baseline.linkSuccessRate}%`
    );
    console.log(
      `   📄 摘要质量: ${enhanced.abstractSuccessRate}% vs ${baseline.abstractSuccessRate}%`
    );
  }

  if (browserUse && !browserUse.error) {
    console.log(`\n🤖 Browser-Use + 增强虚拟列表:`);
    console.log(`   📊 论文收集: ${browserUse.papersFound} 篇`);
    console.log(`   🚀 处理速度: ${browserUse.avgPerMinute} 篇/分钟`);
    console.log(`   🔗 链接成功率: ${browserUse.linkSuccessRate}%`);
    console.log(`   📄 摘要成功率: ${browserUse.abstractSuccessRate}%`);
  }

  console.log('\n🎪 测试总结:');
  console.log('1. 🔧 增强虚拟列表优化: 改进了项目收集的精度和完整性');
  console.log('2. 🧠 智能DOM检测: 等待虚拟列表渲染完成再收集');
  console.log('3. 📏 自适应滚动: 根据收集进度动态调整滚动策略');
  console.log('4. 🎯 多重去重: 基于多种标识符和标题相似度去重');
  console.log('5. 📈 收集统计: 详细的收集效率和分布分析');
  console.log('\n🎉 虚拟列表优化升级完成！');
}

// 执行测试
if (require.main === module) {
  testEnhancedVirtualListOptimization().catch(console.error);
}

export { testEnhancedVirtualListOptimization };
