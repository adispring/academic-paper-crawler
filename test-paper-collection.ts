import puppeteer, { Browser, Page } from 'puppeteer';
import { createBrowserUseAgent } from './src/ai/browser-use';
import { defaultAIConfig } from './src/config';
import { logger } from './src/utils';
import { CrawlerConfig } from './src/types';
import { AcademicPaperCrawler } from './src/crawler';
import dotenv from 'dotenv';
dotenv.config();

/**
 * 论文收集测试器
 * 专门用于测试搜索结果页面的论文收集功能，不进入详情页
 */
class PaperCollectionTester {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private browserUseAgent: any;

  constructor() {
    // 检查必要的环境变量
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error('❌ 错误：未设置 OPENAI_API_KEY 环境变量');
      logger.info('💡 请设置环境变量：export OPENAI_API_KEY="your-api-key"');
      throw new Error('OPENAI_API_KEY 环境变量是必需的');
    }

    // 基于默认配置创建测试专用的AI配置
    const testAIConfig = {
      ...defaultAIConfig,
      enabled: true,
      enableExtraction: true,
      enableDetailExtraction: false, // 测试时不提取详情页，加速测试
      enableTranslation: false, // 测试时不翻译，节省时间
      apiKey: apiKey,
      model: defaultAIConfig.model || 'gpt-4o-mini',
      baseURL: process.env.OPENAI_BASE_URL || defaultAIConfig.baseURL,
      temperature: 0.1,
      maxTokens: 4000,
    };

    logger.info(`🔑 使用 AI 模型: ${testAIConfig.model}`);
    if (testAIConfig.baseURL) {
      logger.info(`🌐 使用自定义 API 基础URL: ${testAIConfig.baseURL}`);
    }

    this.browserUseAgent = createBrowserUseAgent(testAIConfig);
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    logger.info('🚀 初始化测试浏览器...');

    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1920, height: 1080 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ],
    });

    this.page = await this.browser.newPage();

    // 设置额外的反检测措施
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    logger.info('✅ 测试浏览器初始化完成');
  }

  /**
   * 导航到搜索结果页面
   */
  async navigateToSearchResults(url: string): Promise<void> {
    if (!this.page) throw new Error('页面未初始化');

    logger.info(`🔗 导航到搜索结果页面: ${url}`);

    await this.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // 等待页面加载完成
    await new Promise((resolve) => setTimeout(resolve, 3000));

    logger.info('✅ 页面加载完成');
  }

  /**
   * 执行论文收集测试
   */
  async testPaperCollection(
    testUrl: string,
    searchKeyword?: string
  ): Promise<{
    expectedCount: number;
    actualCount: number;
    collectionRate: number;
    scrollCount: number;
    papers: Array<{ title: string; authors: string[]; detailUrl: string }>;
  }> {
    if (!this.page) throw new Error('页面未初始化');

    logger.info(`\n🧪 开始测试论文收集功能`);

    // 判断是否为搜索页面还是直接访问的会议程序页面
    const isSearchMode = !!searchKeyword;
    const displayKeyword = searchKeyword;

    if (isSearchMode) {
      logger.info(`🔍 搜索关键词: ${searchKeyword}`);
    } else {
      logger.info(`📋 会议程序页面模式`);
    }

    const startTime = Date.now();

    // 创建爬虫实例并执行收集
    const config: Partial<CrawlerConfig> = {
      outputPath: './output',
      outputFormat: 'json',
      headless: true,
      timeout: 30000,
      aiConfig: {
        enabled: true,
        model: 'gpt-4o-mini',
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
        temperature: 0.2,
        maxTokens: 1500,
        analysisTypes: ['summarize' as any],
        useBrowserUse: true,
        browserUseMode: 'hybrid',
        enableExtraction: true,
        extractionMode: 'fallback',
        enableDetailExtraction: false, // 测试时不提取详情页，加速测试
      },
    };

    const crawler = new AcademicPaperCrawler(config);

    let results: any[];
    // 使用传统搜索模式
    results = await crawler.searchPapers(searchKeyword!);

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    // 获取预期总数进行对比
    const expectedCount = await this.getExpectedTotalCount();

    const testResult = {
      expectedCount,
      actualCount: results.length,
      collectionRate:
        expectedCount > 0
          ? Math.round((results.length / expectedCount) * 100)
          : 0,
      scrollCount: 0, // 这个需要从日志中提取，暂时设为0
      papers: results.map((paper: any) => ({
        title: paper.title,
        authors: paper.authors,
        detailUrl: paper.detailUrl || paper.paperLink,
      })),
    };

    logger.info(`\n🎯 测试结果汇总:`);
    logger.info(`⏱️ 耗时: ${duration} 秒`);
    logger.info(`📊 预期数量: ${testResult.expectedCount}`);
    logger.info(`📋 实际收集: ${testResult.actualCount}`);
    logger.info(`📈 收集率: ${testResult.collectionRate}%`);

    if (testResult.collectionRate >= 90) {
      logger.info(`✅ 测试通过！收集率 ${testResult.collectionRate}% >= 90%`);
    } else if (testResult.collectionRate >= 80) {
      logger.warn(
        `⚠️ 测试部分通过，收集率 ${testResult.collectionRate}% >= 80%`
      );
    } else {
      logger.error(`❌ 测试失败！收集率 ${testResult.collectionRate}% < 80%`);
    }

    return testResult;
  }

  /**
   * 获取页面预期的文章总数
   */
  private async getExpectedTotalCount(): Promise<number> {
    if (!this.page) return 0;

    try {
      const expectedCount = await this.page.evaluate(() => {
        // 尝试从Content标签页获取总数
        const contentTabs = document.querySelectorAll(
          '[role="tab"], .tab, .nav-tab, .tab-link, .content-tab'
        );

        for (const tab of Array.from(contentTabs)) {
          const tabText = tab.textContent || '';
          const contentMatch = tabText.match(/Content\s*\((\d+)\)/i);
          if (contentMatch) {
            return parseInt(contentMatch[1]);
          }
        }

        return 0;
      });

      return expectedCount;
    } catch (error) {
      logger.error(`获取预期总数失败: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * 显示详细的收集结果
   */
  displayDetailedResults(result: any): void {
    logger.info(`\n📚 收集的论文列表:`);

    result.papers.forEach((paper: any, index: number) => {
      logger.info(`${index + 1}. ${paper.title}`);
      logger.info(`   👥 作者: ${paper.authors.join(', ')}`);
      logger.info(`   🔗 链接: ${paper.detailUrl}`);
      logger.info('');
    });
  }

  /**
   * 生成测试报告
   */
  generateTestReport(result: any): void {
    const report = {
      testName: '论文收集功能测试',
      timestamp: new Date().toISOString(),
      result: {
        success: result.collectionRate >= 80,
        expectedCount: result.expectedCount,
        actualCount: result.actualCount,
        collectionRate: result.collectionRate,
        status:
          result.collectionRate >= 90
            ? 'PASS'
            : result.collectionRate >= 80
            ? 'PARTIAL'
            : 'FAIL',
      },
      papers: result.papers,
    };

    const reportJson = JSON.stringify(report, null, 2);

    logger.info(`\n📄 测试报告:`);
    logger.info(`测试状态: ${report.result.status}`);
    logger.info(`预期数量: ${report.result.expectedCount}`);
    logger.info(`实际收集: ${report.result.actualCount}`);
    logger.info(`收集率: ${report.result.collectionRate}%`);

    // 可以选择将报告保存到文件
    // fs.writeFileSync('test-report.json', reportJson);
    // logger.info('📁 测试报告已保存到 test-report.json');
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      logger.info('🧹 测试资源已清理');
    }
  }
}

/**
 * 主测试函数
 */
async function runTest() {
  const tester = new PaperCollectionTester();

  try {
    // 初始化
    await tester.initialize();

    // 从环境变量或命令行参数获取测试URL
    const testUrl = process.env.TEST_URL || process.argv[2];

    if (!testUrl) {
      logger.error('❌ 错误：未提供测试URL');
      logger.info('💡 请通过以下方式之一提供测试URL：');
      logger.info('   方式1：设置环境变量 export TEST_URL="your-search-url"');
      logger.info(
        '   方式2：通过命令行参数 node test-paper-collection.ts "your-search-url"'
      );
      logger.info('');
      logger.info('📋 示例URL：');
      logger.info('   - https://dblp.org/search?q=machine+learning');
      logger.info(
        '   - https://arxiv.org/search/?query=neural+networks&searchtype=all'
      );
      logger.info('   - https://scholar.google.com/scholar?q=deep+learning');
      throw new Error('测试URL是必需的');
    }

    const searchKeyword = process.env.SEARCH_KEYWORD; // 搜索关键词（可选）

    logger.info(`🔗 测试URL: ${testUrl}`);
    if (searchKeyword) {
      logger.info(`🔍 搜索关键词: ${searchKeyword}`);
    } else {
      logger.info(`📋 会议程序页面模式（无关键词搜索）`);
    }

    // 导航到页面
    await tester.navigateToSearchResults(testUrl);

    // 执行测试
    const result = await tester.testPaperCollection(testUrl, searchKeyword);

    // 显示详细结果
    tester.displayDetailedResults(result);

    // 生成报告
    tester.generateTestReport(result);
  } catch (error) {
    logger.error(`❌ 测试执行失败: ${(error as Error).message}`);
  } finally {
    // 清理资源
    await tester.cleanup();
  }
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  logger.info('🎯 启动论文收集功能测试');

  runTest()
    .then(() => {
      logger.info('✅ 测试完成');
      process.exit(0);
    })
    .catch((error) => {
      logger.error(`💥 测试异常终止: ${error.message}`);
      process.exit(1);
    });
}

export { PaperCollectionTester };
