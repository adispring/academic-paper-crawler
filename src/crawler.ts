import puppeteer, { Browser, Page } from 'puppeteer';
import * as createCsvWriter from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';
import {
  PaperInfo,
  CrawlerConfig,
  SearchResultItem,
  CrawlerStatus,
} from './types';
import { defaultCrawlerConfig, selectors, delays } from './config';
import {
  logger,
  sleep,
  cleanText,
  parseAuthors,
  getAbsoluteUrl,
  setupOutputDirectory,
} from './utils';
import {
  createPaperAnalyzer,
  PaperAnalyzer,
  createBrowserUseAgent,
  BrowserUseAgent,
} from './ai';

/**
 * 学术论文爬虫类
 */
export class AcademicPaperCrawler {
  private browser: Browser | null = null;
  private config: CrawlerConfig;
  private status: CrawlerStatus;
  private aiAnalyzer: PaperAnalyzer | null = null;
  private browserUseAgent: BrowserUseAgent | null = null;

  constructor(config: Partial<CrawlerConfig> = {}) {
    this.config = { ...defaultCrawlerConfig, ...config };
    this.status = {
      keyword: '',
      totalFound: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [],
    };

    setupOutputDirectory(this.config.outputPath);

    // 初始化 AI 分析器（如果启用）
    if (this.config.aiConfig?.enabled) {
      this.aiAnalyzer = createPaperAnalyzer(this.config.aiConfig);
      logger.info('AI 分析器已启用');

      // 初始化 Browser-Use 代理（如果启用）
      if (this.config.aiConfig.useBrowserUse) {
        this.browserUseAgent = createBrowserUseAgent(this.config.aiConfig);
        logger.info('Browser-Use 代理已启用');
      }
    }
  }

  /**
   * 初始化浏览器
   */
  private async initBrowser(): Promise<void> {
    if (this.browser) {
      return;
    }

    logger.info('正在启动浏览器...');
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
  }

  /**
   * 创建新页面
   */
  private async createPage(): Promise<Page> {
    if (!this.browser) {
      await this.initBrowser();
    }

    const page = await this.browser!.newPage();
    await page.setUserAgent(this.config.userAgent);
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultTimeout(this.config.timeout);

    return page;
  }

  /**
   * 搜索论文
   */
  async searchPapers(keyword: string): Promise<PaperInfo[]> {
    this.status.keyword = keyword;
    logger.info(`开始搜索关键词: ${keyword}`);

    const page = await this.createPage();
    const papers: PaperInfo[] = [];

    try {
      const searchUrl = `${this.config.baseUrl}?searchKey=${encodeURIComponent(
        keyword
      )}`;
      logger.info(`访问搜索页面: ${searchUrl}`);

      await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      await sleep(delays.pageLoad);

      const searchResults = await this.extractSearchResults(page, keyword);
      this.status.totalFound = searchResults.length;

      logger.info(`找到 ${searchResults.length} 个搜索结果`);

      for (let i = 0; i < searchResults.length; i++) {
        const result = searchResults[i];
        this.status.processed = i + 1;

        logger.info(
          `处理第 ${i + 1}/${searchResults.length} 个结果: ${result.title}`
        );
        logger.info('result', result);

        try {
          // 检查是否启用详情页提取
          const enableDetailExtraction =
            this.config.aiConfig?.enableDetailExtraction !== false;

          if (enableDetailExtraction) {
            // 常规模式：提取详情页内容（包括摘要和论文链接）
            const paperInfo = await this.extractPaperDetail(result, keyword);
            if (paperInfo) {
              papers.push(paperInfo);
              this.status.successful++;
              logger.info(`成功提取论文信息: ${paperInfo.title}`);
            }
          } else {
            // 快速模式：直接使用搜索结果，不提取详情页
            logger.info(`🚀 快速模式：跳过详情页提取，直接使用搜索结果信息`);
            const paperInfo: PaperInfo = {
              title: result.title,
              authors: result.authors,
              abstract: result.abstract || '', // 使用搜索结果中的摘要（如果有）
              paperLink: result.detailUrl, // 快速模式下使用详情页链接作为论文链接
              detailUrl: result.detailUrl, // 添加详情页URL
              searchKeyword: keyword,
              crawledAt: new Date(),
            };

            papers.push(paperInfo);
            this.status.successful++;
            logger.info(`快速模式成功处理: ${paperInfo.title}`);
          }
        } catch (error) {
          this.status.failed++;
          const errorMsg = `处理论文信息失败: ${result.title} - ${
            (error as Error).message
          }`;
          this.status.errors.push(errorMsg);
          logger.error(errorMsg);
        }

        if (i < searchResults.length - 1) {
          await sleep(delays.betweenRequests);
        }
      }

      // 执行 AI 分析（如果启用）
      if (
        this.aiAnalyzer &&
        papers.length > 0 &&
        this.config.aiConfig?.enableAnalysis
      ) {
        logger.info('开始执行 AI 分析...');
        try {
          const enhancedPapers = await this.aiAnalyzer.analyzeMultiplePapers(
            papers
          );
          logger.info('AI 分析完成');
          return enhancedPapers;
        } catch (error) {
          logger.error(`AI 分析失败: ${(error as Error).message}`);
          return papers; // 返回未增强的论文
        }
      } else if (
        this.aiAnalyzer &&
        papers.length > 0 &&
        !this.config.aiConfig?.enableAnalysis
      ) {
        logger.info('⚠ AI论文分析功能已被禁用，跳过分析步骤');
      }
    } catch (error) {
      const errorMsg = `搜索过程中发生错误: ${(error as Error).message}`;
      this.status.errors.push(errorMsg);
      logger.error(errorMsg);
      throw error;
    } finally {
      await page.close();
    }

    logger.info(
      `搜索完成。成功: ${this.status.successful}, 失败: ${this.status.failed}`
    );
    return papers;
  }

  /**
   * 虚拟列表专用的滚动策略
   */
  private async performVirtualListScroll(page: Page): Promise<void> {
    // 虚拟列表需要更小、更慢的滚动步长
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const viewportHeight = window.innerHeight;
        const scrollDistance = Math.floor(viewportHeight / 4); // 每次滚动1/4视窗，比普通滚动更小
        const currentY = window.scrollY;
        const targetY = currentY + scrollDistance;
        const duration = 1000 + Math.random() * 500; // 1-1.5s，比普通滚动更慢
        let startTime: number;

        function animate(currentTime: number) {
          if (!startTime) startTime = currentTime;
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // 使用非常平缓的缓动函数
          const easeOut = 1 - Math.pow(1 - progress, 3);
          const currentScrollY = currentY + (targetY - currentY) * easeOut;
          window.scrollTo(0, currentScrollY);

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            resolve();
          }
        }

        requestAnimationFrame(animate);
      });
    });
  }

  /**
   * 检测虚拟列表并返回相关信息 - 针对FAccT网站优化
   */
  private async detectVirtualList(page: Page): Promise<{
    isVirtualList: boolean;
    expectedTotal: number;
    framework?: string;
    virtualScrollerHeight?: number;
    debugInfo?: {
      hasVirtualScroller: boolean;
      hasTotalPadding: boolean;
      hasScrollableContent: boolean;
      currentOffset: number;
      totalPaddingHeight: number;
    };
  }> {
    return await page.evaluate(() => {
      // 检测虚拟列表组件 - 针对FAccT/SIGCHI网站
      const hasVirtualScroller = !!document.querySelector('virtual-scroller');
      const hasTotalPadding = !!document.querySelector(
        '.total-padding, [class*="total-padding"]'
      );
      const hasScrollableContent = !!document.querySelector(
        '.scrollable-content, [class*="scrollable-content"]'
      );

      // 更精确地检测期望总数 - 针对FAccT 2025网站
      let expectedTotal = 0;

      // 方法1：从导航标签中提取（最准确）
      const navTabs = document.querySelectorAll(
        'nav[role="navigation"] a, .navbar-tabs a, sigchi-navbar-item, [sigchi-navbar-router-item]'
      );

      for (const tab of Array.from(navTabs)) {
        const tabText = tab.textContent || '';
        // 匹配 "Content (280)" 格式
        const contentMatch = tabText.match(/Content[^(]*\((\d+)\)/i);
        if (contentMatch) {
          expectedTotal = parseInt(contentMatch[1]);
          console.info(`从导航标签检测到Content总数: ${expectedTotal}`);
          break;
        }
      }

      // 方法2：从conference-search组件中查找
      if (expectedTotal === 0) {
        const searchComponent = document.querySelector('conference-search');
        if (searchComponent) {
          const countElements = searchComponent.querySelectorAll('.count');
          for (const countEl of Array.from(countElements)) {
            const countText = countEl.textContent || '';
            const match = countText.match(/\((\d+)\)/);
            if (match && countText.toLowerCase().includes('content')) {
              expectedTotal = parseInt(match[1]);
              console.info(`从搜索组件检测到Content总数: ${expectedTotal}`);
              break;
            }
          }
        }
      }

      // 方法3：从活跃标签页中提取
      if (expectedTotal === 0) {
        const activeTab = document.querySelector(
          '.active .count, [class*="active"] .count'
        );
        if (activeTab) {
          const countText = activeTab.textContent || '';
          const match = countText.match(/\((\d+)\)/);
          if (match) {
            expectedTotal = parseInt(match[1]);
            console.info(`从活跃标签检测到总数: ${expectedTotal}`);
          }
        }
      }

      // 方法4：通用标签页检测（兜底）
      if (expectedTotal === 0) {
        const contentTabs = document.querySelectorAll(
          '[role="tab"], .tab, .nav-tab, .tab-link, a[href*="content"]'
        );
        for (const tab of Array.from(contentTabs)) {
          const tabText = tab.textContent || '';
          const contentMatch = tabText.match(
            /(?:Content|Papers|Results)[^(]*\((\d+)\)/i
          );
          if (contentMatch) {
            expectedTotal = parseInt(contentMatch[1]);
            console.info(`从通用标签检测到总数: ${expectedTotal}`);
            break;
          }
        }
      }

      // 检测框架信息
      let framework: string | undefined;
      if (hasVirtualScroller) {
        framework = 'Angular CDK Virtual Scrolling';
        // 检测Angular版本
        const angularVersionMatch =
          document.documentElement.getAttribute('ng-version');
        if (angularVersionMatch) {
          framework += ` (Angular ${angularVersionMatch})`;
        }
      }

      // 获取虚拟滚动容器详细信息
      let virtualScrollerHeight = 0;
      let currentOffset = 0;
      let totalPaddingHeight = 0;

      if (hasVirtualScroller) {
        const virtualScroller = document.querySelector(
          'virtual-scroller'
        ) as HTMLElement;
        if (virtualScroller) {
          virtualScrollerHeight = virtualScroller.scrollHeight;

          // 获取当前偏移量
          const scrollableContent = virtualScroller.querySelector(
            '.scrollable-content'
          ) as HTMLElement;
          if (scrollableContent) {
            const transform = scrollableContent.style.transform;
            const translateMatch = transform.match(/translateY\(([0-9.]+)px\)/);
            if (translateMatch) {
              currentOffset = parseFloat(translateMatch[1]);
            }
          }

          // 获取总padding高度
          const totalPadding = virtualScroller.querySelector(
            '.total-padding'
          ) as HTMLElement;
          if (totalPadding) {
            totalPaddingHeight = parseFloat(totalPadding.style.height) || 0;
          }
        }
      }

      const isVirtualList =
        hasVirtualScroller || (hasTotalPadding && hasScrollableContent);

      console.info(
        `虚拟列表检测结果: isVirtualList=${isVirtualList}, expectedTotal=${expectedTotal}, framework=${framework}`
      );
      console.info(
        `虚拟滚动器信息: height=${virtualScrollerHeight}, offset=${currentOffset}, totalPadding=${totalPaddingHeight}`
      );

      return {
        isVirtualList,
        expectedTotal,
        framework,
        virtualScrollerHeight,
        // 添加额外的调试信息
        debugInfo: {
          hasVirtualScroller,
          hasTotalPadding,
          hasScrollableContent,
          currentOffset,
          totalPaddingHeight,
        },
      };
    });
  }

  /**
   * 等待虚拟列表DOM稳定 - 针对FAccT网站优化
   */
  private async waitForVirtualListStable(page: Page): Promise<void> {
    let previousItemCount = 0;
    let previousOffset = 0;
    let previousScrollTop = 0;
    let stableCount = 0;
    const maxWait = 8; // 增加等待次数

    for (let i = 0; i < maxWait; i++) {
      await sleep(400); // 增加等待时间到400ms

      const domState = await page.evaluate(() => {
        // 针对FAccT网站的精确DOM检测
        const contentCards = document.querySelectorAll(
          'content-card.search-item, content-card'
        );
        const itemCount = contentCards.length;

        // 检测虚拟滚动偏移
        let currentOffset = 0;
        const scrollableContent = document.querySelector(
          '.scrollable-content'
        ) as HTMLElement;
        if (scrollableContent) {
          const transform = scrollableContent.style.transform;
          const translateMatch = transform.match(/translateY\(([0-9.]+)px\)/);
          if (translateMatch) {
            currentOffset = parseFloat(translateMatch[1]);
          }
        }

        // 检测虚拟滚动器状态
        let scrollTop = 0;
        const virtualScroller = document.querySelector(
          'virtual-scroller'
        ) as HTMLElement;
        if (virtualScroller) {
          scrollTop = virtualScroller.scrollTop;
        }

        // 检测是否有加载指示器
        const hasLoadingIndicator = !!(
          document.querySelector(
            '.loading, .spinner, [class*="loading"], [class*="spinner"]'
          ) || document.querySelector('[aria-busy="true"]')
        );

        return {
          itemCount,
          currentOffset,
          scrollTop,
          hasLoadingIndicator,
        };
      });

      // 增强的稳定性检查
      const isItemCountStable =
        domState.itemCount === previousItemCount && domState.itemCount > 0;
      const isOffsetStable =
        Math.abs(domState.currentOffset - previousOffset) < 2; // 允许2px偏差
      const isScrollTopStable =
        Math.abs(domState.scrollTop - previousScrollTop) < 10; // 允许10px偏差
      const isNotLoading = !domState.hasLoadingIndicator;

      if (
        isItemCountStable &&
        (isOffsetStable || isScrollTopStable) &&
        isNotLoading
      ) {
        stableCount++;
        if (stableCount >= 2) {
          // 连续两次稳定
          logger.info(
            `✅ DOM已稳定: ${domState.itemCount}个项目, 偏移${domState.currentOffset}px, scrollTop${domState.scrollTop}px`
          );
          break;
        }
      } else {
        stableCount = 0;
        logger.info(
          `⏳ 等待DOM稳定[${i + 1}/${maxWait}]: ${
            domState.itemCount
          }个项目 (前次${previousItemCount}), 偏移${
            domState.currentOffset
          }px (前次${previousOffset}px), scrollTop${
            domState.scrollTop
          }px, 加载中${domState.hasLoadingIndicator}`
        );
      }

      previousItemCount = domState.itemCount;
      previousOffset = domState.currentOffset;
      previousScrollTop = domState.scrollTop;
    }

    if (stableCount < 2) {
      logger.warn('⚠️ DOM稳定检测超时，继续执行');
    }
  }

  /**
   * 虚拟列表专用的滚动加载处理 - 优化版本
   */
  private async loadVirtualListResults(
    page: Page,
    expectedTotal: number
  ): Promise<void> {
    const scrollConfig = this.config.scrollConfig!;
    const maxScrolls = Math.max(30, Math.ceil(expectedTotal / 2)); // 动态调整最大滚动次数
    const maxRetries = scrollConfig.virtualListMaxRetries || 8;
    const baseDelay = scrollConfig.virtualListScrollDelay || 3500;
    const collectionThreshold = Math.max(
      0.75,
      scrollConfig.virtualListCollectionThreshold || 1
    ); // 提高阈值下限

    logger.info(
      `🎯 开始虚拟列表收集: 期望${expectedTotal}个项目, 阈值${Math.round(
        collectionThreshold * 100
      )}%, 最大滚动${maxScrolls}次`
    );

    // 使用Map存储收集的项目，支持更多元数据
    const collectedItems = new Map<string, any>();
    let scrollCount = 0;
    let consecutiveNoNewItems = 0;
    let stagnationCount = 0;
    let retryCount = 0;
    let lastStableCount = 0;

    // 重新检测并更新期望总数（可能更准确）
    const updatedVirtualListInfo = await this.detectVirtualList(page);
    if (updatedVirtualListInfo.expectedTotal > expectedTotal) {
      expectedTotal = updatedVirtualListInfo.expectedTotal;
      logger.info(`📊 更新期望项目数为: ${expectedTotal}`);
    }

    while (scrollCount < maxScrolls && retryCount < maxRetries) {
      logger.info(
        `\n🔄 第${scrollCount + 1}次滚动 (重试${retryCount}/${maxRetries})`
      );

      try {
        // 等待DOM稳定
        await this.waitForVirtualListStable(page);

        // 提取当前页面项目
        const currentItems = await this.extractVirtualListItems(page);
        logger.info(`📦 当前页面提取到 ${currentItems.length} 个项目`);

        if (currentItems.length === 0) {
          logger.warn('⚠️ 当前页面没有提取到任何项目');
          consecutiveNoNewItems++;

          if (consecutiveNoNewItems >= 3) {
            logger.warn('🔚 连续3次未提取到项目，可能已到列表末尾');
            break;
          }

          // 尝试更大步长滚动
          const context = {
            currentProgress: collectedItems.size / expectedTotal,
            consecutiveNoNewItems: consecutiveNoNewItems + 2, // 强制使用大步长
            stagnationCount: 0,
          };
          await this.performAdaptiveVirtualListScroll(page, context);

          const adaptiveDelay = this.calculateAdaptiveDelay(baseDelay, {
            consecutiveNoNewItems,
            stagnationCount,
            progressRatio: collectedItems.size / expectedTotal,
          });

          logger.info(`⏳ 空页面等待 ${adaptiveDelay}ms`);
          await sleep(adaptiveDelay);

          scrollCount++;
          continue;
        }

        // 分析新项目
        const analysis = this.analyzeCollectedItems(
          currentItems,
          collectedItems
        );

        // 将新项目添加到收集中
        analysis.newItems.forEach((item, index) => {
          collectedItems.set(item.uniqueId, {
            ...item,
            scrollIteration: scrollCount,
            extractionOrder: collectedItems.size + index + 1,
            timestamp: Date.now(),
          });
        });

        const currentTotal = collectedItems.size;
        const progressRatio = currentTotal / expectedTotal;
        const completionPercentage = Math.round(progressRatio * 100);

        logger.info(
          `📈 收集进度: ${currentTotal}/${expectedTotal} (${completionPercentage}%) | 新增${analysis.newItems.length}个, 重复${analysis.duplicates}个`
        );

        // 更新连续无新项目计数
        if (analysis.newItems.length === 0) {
          consecutiveNoNewItems++;
          logger.warn(`⚠️ 连续 ${consecutiveNoNewItems} 次无新项目`);
        } else {
          consecutiveNoNewItems = 0;
        }

        // 检测是否停滞（收集数量没有显著增长）
        if (currentTotal === lastStableCount) {
          stagnationCount++;
        } else {
          stagnationCount = 0;
          lastStableCount = currentTotal;
        }

        // 提前完成条件检查（更严格）
        const shouldComplete =
          (progressRatio >= collectionThreshold &&
            consecutiveNoNewItems >= 2) || // 达到阈值且连续无新项目
          progressRatio >= 1 || // 达到95%
          currentTotal >= expectedTotal; // 达到或超过期望数

        if (shouldComplete) {
          logger.info(
            `✅ 满足完成条件: 进度${completionPercentage}%, 连续无新项目${consecutiveNoNewItems}次`
          );
          break;
        }

        // 检测是否需要重试
        if (consecutiveNoNewItems >= 4 || stagnationCount >= 3) {
          retryCount++;
          logger.warn(
            `🔄 触发重试 ${retryCount}/${maxRetries}: 连续无新项目${consecutiveNoNewItems}次, 停滞${stagnationCount}次`
          );

          if (retryCount >= maxRetries) {
            logger.warn('🛑 达到最大重试次数，结束收集');
            break;
          }

          // 重试时重置状态并使用激进滚动
          consecutiveNoNewItems = 0;
          stagnationCount = 0;
        }

        // 计算滚动上下文
        const scrollContext = {
          currentProgress: progressRatio,
          consecutiveNoNewItems,
          stagnationCount,
        };

        // 执行自适应滚动
        await this.performAdaptiveVirtualListScroll(page, scrollContext);

        // 计算自适应延迟
        const adaptiveDelay = this.calculateAdaptiveDelay(baseDelay, {
          consecutiveNoNewItems,
          stagnationCount,
          progressRatio,
        });

        logger.info(`⏳ 等待 ${adaptiveDelay}ms 后继续`);
        await sleep(adaptiveDelay);

        scrollCount++;

        // 定期输出详细统计
        if (scrollCount % 5 === 0) {
          this.logVirtualListCollectionStats(
            collectedItems,
            expectedTotal,
            scrollCount
          );
        }
      } catch (error) {
        logger.error(
          `滚动第${scrollCount + 1}次时出错: ${(error as Error).message}`
        );
        retryCount++;

        if (retryCount >= maxRetries) {
          logger.error('达到最大重试次数，停止收集');
          break;
        }

        await sleep(2000); // 错误时等待2秒
        scrollCount++;
      }
    }

    // 输出最终统计
    const finalTotal = collectedItems.size;
    const finalCompletionRate = Math.round((finalTotal / expectedTotal) * 100);

    logger.info('\n🎉 虚拟列表收集完成!');
    logger.info(
      `📊 最终统计: ${finalTotal}/${expectedTotal} (${finalCompletionRate}%)`
    );
    logger.info(`🔄 总滚动次数: ${scrollCount}`);
    logger.info(`🔁 重试次数: ${retryCount}/${maxRetries}`);
    logger.info(
      `⚡ 平均效率: ${Math.round(
        finalTotal / Math.max(scrollCount, 1)
      )} 项/次滚动`
    );

    // 输出详细统计
    this.logVirtualListCollectionStats(
      collectedItems,
      expectedTotal,
      scrollCount
    );

    if (finalCompletionRate < 70) {
      logger.warn(
        `⚠️ 收集完成率较低 (${finalCompletionRate}%)，可能需要调整参数`
      );
      logger.info(
        '💡 建议: 增加 --virtual-list-max-retries 或降低 --virtual-list-threshold'
      );
    } else if (finalCompletionRate >= 95) {
      logger.info('🎯 收集完成率excellent! (≥95%)');
    }
  }

  /**
   * 多策略提取虚拟列表项目 - 针对FAccT网站结构优化
   */
  private async extractVirtualListItems(page: Page): Promise<any[]> {
    return await page.evaluate(() => {
      const items: any[] = [];

      // 针对FAccT/SIGCHI网站的精确选择器策略
      const itemSelectors = [
        'content-card.search-item', // FAccT 2025主要结构
        'content-card',
        '[class*="search-item"]',
        '[class*="card"]',
        '[class*="content-card"]',
        'article',
        '[role="article"]',
        '.result-item',
        '.paper-item',
      ];

      let selectedElements: NodeListOf<Element> | null = null;
      let usedSelector = '';

      // 找到最有效的选择器，优先使用最精确的
      for (const selector of itemSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          // 验证元素是否包含论文信息
          const firstElement = elements[0];
          const hasTitle = firstElement.querySelector(
            '.card-data-name .name, program-card-name .name, h3, h4, h5, .title, [class*="title"]'
          );
          const hasLink = firstElement.querySelector(
            'a.link-block.card-container, a[href*="content"], a[href*="program"]'
          );
          const hasPersonList = firstElement.querySelector('person-list');

          if ((hasTitle || hasLink) && elements.length >= 3) {
            selectedElements = elements;
            usedSelector = selector;
            break;
          }
        }
      }

      if (!selectedElements) {
        console.warn('未找到有效的列表项目元素');
        return [];
      }

      console.info(
        `使用选择器: ${usedSelector}, 找到 ${selectedElements.length} 个元素`
      );

      Array.from(selectedElements).forEach((element, index) => {
        try {
          // 针对FAccT网站的精确标题提取
          let title = '';
          const titleSelectors = [
            '.card-data-name .name', // FAccT 2025主要标题结构
            'program-card-name .name',
            '.name',
            'h3 .name',
            'a.link-block.card-container[aria-label]', // 从aria-label提取
            'h3 a',
            'h4 a',
            'h5 a',
            'h3',
            'h4',
            'h5',
            '.title',
            '.paper-title',
            '.content-title',
            'strong',
            'b',
          ];

          for (const selector of titleSelectors) {
            const titleEl = element.querySelector(selector);
            if (titleEl?.textContent?.trim()) {
              let candidateTitle = titleEl.textContent.trim();

              // 如果是从aria-label提取，需要清理后缀
              if (selector.includes('aria-label')) {
                candidateTitle = candidateTitle.replace(
                  /\s+clickable Content card$/,
                  ''
                );
              }

              candidateTitle = candidateTitle.replace(/\s+/g, ' ');

              if (
                candidateTitle.length > 8 &&
                !candidateTitle.match(/^\d+$/) &&
                !candidateTitle.toLowerCase().includes('tutorial') &&
                !candidateTitle.toLowerCase().includes('papers') &&
                !candidateTitle.toLowerCase().includes('sessions')
              ) {
                title = candidateTitle;
                break;
              }
            }
          }

          // 针对FAccT网站的精确作者提取
          let authors: string[] = [];
          const authorSelectors = [
            'person-list a[person-link]', // FAccT 2025主要作者结构
            'person-list .people-container a',
            'person-list',
            '.people-container a',
            '.author-list a',
            '.authors a',
            '.author a',
            '.people-container',
            '.author-list',
            '.authors',
            '.author',
            '.byline',
            '.credits',
            'small a',
            '.text-muted a',
            '.secondary-text a',
            'small',
            '.text-muted',
            '.secondary-text',
          ];

          for (const selector of authorSelectors) {
            if (selector.includes('a[person-link]') || selector.includes('a')) {
              // 直接提取链接中的作者名
              const authorLinks = element.querySelectorAll(selector);
              if (authorLinks.length > 0) {
                authors = Array.from(authorLinks)
                  .map((link) => link.textContent?.trim())
                  .filter(
                    (name) => name && name.length > 1 && !name.match(/^\d+$/)
                  ) as string[];
                if (authors.length > 0) break;
              }
            } else {
              // 从文本中提取作者
              const authorsEl = element.querySelector(selector);
              if (authorsEl?.textContent?.trim()) {
                const authorsText = authorsEl.textContent.trim();
                // 清理和分割作者
                const cleanAuthorsText = authorsText
                  .replace(/\s+/g, ' ')
                  .trim();
                if (cleanAuthorsText && cleanAuthorsText.length > 2) {
                  authors = cleanAuthorsText
                    .split(/[,;]|\s*,\s+/)
                    .map((a) => a.trim())
                    .filter((a) => a.length > 1 && !a.match(/^\d+$/));
                  if (authors.length > 0) break;
                }
              }
            }
          }

          // 针对FAccT网站的精确链接提取
          let detailUrl = '';
          const linkSelectors = [
            'a.link-block.card-container[href*="content"]', // FAccT 2025主要链接结构
            'a.link-block.card-container[href*="program"]',
            'a[href*="/facct/2025/program/content/"]',
            'a[href*="content"]',
            'a[href*="program"]',
            'a[href*="paper"]',
            '.link-block[href]',
            'h3 a',
            'h4 a',
            'h5 a',
            'a[href]:first-of-type',
          ];

          for (const selector of linkSelectors) {
            const linkEl = element.querySelector(selector) as HTMLAnchorElement;
            if (linkEl?.href) {
              // 确保是完整的URL
              if (linkEl.href.startsWith('http')) {
                detailUrl = linkEl.href;
              } else if (linkEl.href.startsWith('/')) {
                detailUrl = window.location.origin + linkEl.href;
              }
              if (detailUrl) break;
            }
          }

          // 从URL中提取内容ID作为更精确的唯一标识符
          let contentId = '';
          if (detailUrl) {
            const idMatch = detailUrl.match(/\/content\/(\d+)/);
            if (idMatch) {
              contentId = idMatch[1];
            }
          }

          // 生成更精确的唯一标识符系统
          const uniqueIdentifiers = [
            contentId ? `content-${contentId}` : '',
            detailUrl,
            title
              ? `title-${title.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '-')}`
              : '',
            authors.length > 0
              ? `author-${authors[0].replace(/[^a-zA-Z0-9]/g, '-')}`
              : '',
            `element-${index}`,
          ].filter((id) => id && id.length > 3);

          const primaryId = uniqueIdentifiers[0] || `item-${index}`;

          // 提取论文类型信息
          let paperType = '';
          const typeEl = element.querySelector(
            '.content-type-block .type-name'
          );
          if (typeEl?.textContent?.trim()) {
            paperType = typeEl.textContent.trim();
          }

          // 检查是否有在线演示标志
          const hasVirtualLabel = !!element.querySelector('virtual-label');

          if (title || detailUrl || contentId) {
            items.push({
              title: title || '未知标题',
              authors: authors,
              detailUrl: detailUrl,
              contentId: contentId,
              paperType: paperType,
              isVirtualPresentation: hasVirtualLabel,
              uniqueId: primaryId,
              alternativeIds: uniqueIdentifiers.slice(1),
              domIndex: index,
              elementSelector: usedSelector,
              extractedAt: Date.now(),
              // 调试信息
              debugInfo: {
                hasTitle: !!title,
                hasAuthors: authors.length > 0,
                hasDetailUrl: !!detailUrl,
                hasContentId: !!contentId,
                titleLength: title.length,
                authorsCount: authors.length,
              },
            });
          }
        } catch (error) {
          console.warn(`提取第${index}项时出错:`, error);
        }
      });

      return items;
    });
  }

  /**
   * 分析收集的项目，检测新项目和重复项目
   */
  private analyzeCollectedItems(
    currentItems: any[],
    collectedItems: Map<string, any>
  ): {
    newItems: any[];
    duplicates: number;
  } {
    const newItems: any[] = [];
    let duplicates = 0;

    for (const item of currentItems) {
      let isNew = true;

      // 检查主要唯一标识符
      if (collectedItems.has(item.uniqueId)) {
        isNew = false;
        duplicates++;
      } else {
        // 检查替代标识符
        for (const altId of item.alternativeIds || []) {
          if (collectedItems.has(altId)) {
            isNew = false;
            duplicates++;
            break;
          }
        }

        // 检查是否已存在类似项目（基于标题相似度）
        if (isNew && item.title) {
          for (const [, existingItem] of collectedItems) {
            if (
              this.calculateTitleSimilarity(item.title, existingItem.title) >
              0.85
            ) {
              isNew = false;
              duplicates++;
              break;
            }
          }
        }
      }

      if (isNew) {
        newItems.push(item);
      }
    }

    return { newItems, duplicates };
  }

  /**
   * 计算标题相似度
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    if (!title1 || !title2) return 0;

    const normalize = (str: string) =>
      str
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const norm1 = normalize(title1);
    const norm2 = normalize(title2);

    if (norm1 === norm2) return 1;

    // 简单的Jaccard相似度
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));
    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 自适应虚拟列表滚动策略 - 全面重构支持多种虚拟滚动实现
   */
  private async performAdaptiveVirtualListScroll(
    page: Page,
    context: {
      currentProgress: number;
      consecutiveNoNewItems: number;
      stagnationCount: number;
    }
  ): Promise<void> {
    const { currentProgress, consecutiveNoNewItems, stagnationCount } = context;

    const scrollInfo = await page.evaluate((ctx) => {
      return new Promise<any>((resolve) => {
        // 详细分析虚拟滚动结构
        const analysis = {
          virtualScroller: null as HTMLElement | null,
          scrollContainer: null as HTMLElement | null,
          scrollTarget: null as HTMLElement | null,
          method: '',
          details: {},
        };

        // 1. 查找virtual-scroller元素
        analysis.virtualScroller = document.querySelector(
          'virtual-scroller'
        ) as HTMLElement;

        // 2. 查找可能的滚动容器（按优先级）
        const containerSelectors = [
          'virtual-scroller',
          '.virtual-scroller',
          '[class*="virtual-scroller"]',
          '.cdk-virtual-scroll-viewport',
          '[cdk-virtual-scroll-viewport]',
          '.virtual-scroll-container',
          '.scrollable-content',
          '.program-body', // FAccT特定
          'main',
          '.main-content',
          '.content-area',
          '[style*="overflow"]',
          '[style*="scroll"]',
        ];

        let scrollableContainer: HTMLElement | null = null;

        for (const selector of containerSelectors) {
          const element = document.querySelector(selector) as HTMLElement;
          if (element) {
            const style = getComputedStyle(element);
            const hasScrollable =
              style.overflowY === 'auto' ||
              style.overflowY === 'scroll' ||
              style.overflow === 'auto' ||
              style.overflow === 'scroll' ||
              element.scrollHeight > element.clientHeight;

            if (hasScrollable) {
              scrollableContainer = element;
              analysis.scrollContainer = element;
              analysis.details = {
                selector,
                scrollHeight: element.scrollHeight,
                clientHeight: element.clientHeight,
                scrollTop: element.scrollTop,
                canScroll: element.scrollHeight > element.clientHeight,
                computedStyle: {
                  overflow: style.overflow,
                  overflowY: style.overflowY,
                  height: style.height,
                  maxHeight: style.maxHeight,
                },
              };
              console.info(
                `找到可滚动容器: ${selector}, scrollHeight=${element.scrollHeight}, clientHeight=${element.clientHeight}`
              );
              break;
            }
          }
        }

        // 如果没找到滚动容器，尝试window/document
        if (!scrollableContainer) {
          analysis.method = 'window';
          analysis.scrollTarget = document.documentElement;
          analysis.details = {
            windowHeight: window.innerHeight,
            documentHeight: document.documentElement.scrollHeight,
            currentScroll: window.scrollY,
            canScroll:
              document.documentElement.scrollHeight > window.innerHeight,
          };
          console.info('未找到特定滚动容器，使用window滚动');
        } else {
          analysis.method = 'container';
          analysis.scrollTarget = scrollableContainer;
        }

        // 计算滚动距离和策略
        let scrollDistance = 0;
        let targetScrollTop = 0;
        const scrollTarget = analysis.scrollTarget!;

        if (analysis.method === 'window') {
          const viewportHeight = window.innerHeight;
          const currentY = window.scrollY;
          const maxY = document.documentElement.scrollHeight - viewportHeight;

          // 基于进度计算滚动距离
          if (ctx.currentProgress < 0.2) {
            scrollDistance = Math.floor(viewportHeight * 0.8); // 大步长
          } else if (ctx.currentProgress < 0.5) {
            scrollDistance = Math.floor(viewportHeight * 0.5); // 中步长
          } else {
            scrollDistance = Math.floor(viewportHeight * 0.3); // 小步长
          }

          if (ctx.consecutiveNoNewItems > 2) {
            scrollDistance = Math.floor(viewportHeight * 1.2); // 激进滚动
          } else if (ctx.stagnationCount > 1) {
            scrollDistance = Math.floor(viewportHeight * 0.2); // 精细滚动
          }

          targetScrollTop = Math.min(currentY + scrollDistance, maxY);

          console.info(
            `Window滚动: 当前=${currentY}, 距离=${scrollDistance}, 目标=${targetScrollTop}, 最大=${maxY}`
          );

          // 执行平滑滚动
          window.scrollTo({
            top: targetScrollTop,
            behavior: 'smooth',
          });

          // 等待滚动完成
          setTimeout(() => {
            resolve({
              method: 'window',
              scrollDistance,
              beforeScroll: currentY,
              afterScroll: window.scrollY,
              targetScroll: targetScrollTop,
              maxScroll: maxY,
              progress: window.scrollY / maxY,
              analysis,
            });
          }, 800);
        } else {
          // 容器滚动
          const containerHeight = scrollTarget.clientHeight;
          const scrollHeight = scrollTarget.scrollHeight;
          const currentScrollTop = scrollTarget.scrollTop;
          const maxScrollTop = scrollHeight - containerHeight;

          // 基于进度计算滚动距离
          if (ctx.currentProgress < 0.2) {
            scrollDistance = Math.floor(containerHeight * 0.8); // 大步长
          } else if (ctx.currentProgress < 0.5) {
            scrollDistance = Math.floor(containerHeight * 0.5); // 中步长
          } else {
            scrollDistance = Math.floor(containerHeight * 0.3); // 小步长
          }

          if (ctx.consecutiveNoNewItems > 2) {
            scrollDistance = Math.floor(containerHeight * 1.2); // 激进滚动
          } else if (ctx.stagnationCount > 1) {
            scrollDistance = Math.floor(containerHeight * 0.2); // 精细滚动
          }

          targetScrollTop = Math.min(
            currentScrollTop + scrollDistance,
            maxScrollTop
          );

          console.info(
            `容器滚动: 容器高度=${containerHeight}, 滚动高度=${scrollHeight}, 当前=${currentScrollTop}, 距离=${scrollDistance}, 目标=${targetScrollTop}, 最大=${maxScrollTop}`
          );

          // 尝试多种滚动方式
          const scrollMethods = [
            () => {
              // 方法1: 直接设置scrollTop
              scrollTarget.scrollTop = targetScrollTop;
            },
            () => {
              // 方法2: 使用scrollTo
              if (scrollTarget.scrollTo) {
                scrollTarget.scrollTo({
                  top: targetScrollTop,
                  behavior: 'smooth',
                });
              }
            },
            () => {
              // 方法3: 触发滚动事件
              scrollTarget.scrollTop = targetScrollTop;
              scrollTarget.dispatchEvent(
                new Event('scroll', { bubbles: true })
              );
            },
            () => {
              // 方法4: 逐步滚动
              const step = scrollDistance / 10;
              let current = currentScrollTop;
              const interval = setInterval(() => {
                current += step;
                if (current >= targetScrollTop) {
                  current = targetScrollTop;
                  clearInterval(interval);
                }
                scrollTarget.scrollTop = current;
              }, 50);
            },
          ];

          // 执行第一个滚动方法
          try {
            scrollMethods[0]();
          } catch (e) {
            console.warn('滚动方法1失败，尝试方法2', e);
            try {
              scrollMethods[1]();
            } catch (e2) {
              console.warn('滚动方法2失败，尝试方法3', e2);
              scrollMethods[2]();
            }
          }

          // 等待滚动完成并检查结果
          setTimeout(() => {
            const finalScrollTop = scrollTarget.scrollTop;
            const actualDistance = finalScrollTop - currentScrollTop;

            console.info(
              `容器滚动结果: ${currentScrollTop} -> ${finalScrollTop} (实际移动${actualDistance}px)`
            );

            // 如果滚动没有生效，尝试window滚动作为备选
            if (actualDistance === 0 && scrollDistance > 0) {
              console.warn('容器滚动无效，回退到window滚动');
              const windowY = window.scrollY;
              const windowTarget = windowY + scrollDistance;
              window.scrollTo({
                top: windowTarget,
                behavior: 'smooth',
              });

              setTimeout(() => {
                resolve({
                  method: 'container-fallback-window',
                  scrollDistance,
                  beforeScroll: currentScrollTop,
                  afterScroll: scrollTarget.scrollTop,
                  windowBefore: windowY,
                  windowAfter: window.scrollY,
                  targetScroll: targetScrollTop,
                  maxScroll: maxScrollTop,
                  progress: finalScrollTop / maxScrollTop,
                  analysis,
                });
              }, 400);
            } else {
              resolve({
                method: 'container',
                scrollDistance,
                beforeScroll: currentScrollTop,
                afterScroll: finalScrollTop,
                targetScroll: targetScrollTop,
                maxScroll: maxScrollTop,
                progress: finalScrollTop / maxScrollTop,
                analysis,
              });
            }
          }, 600);
        }
      });
    }, context);

    // 输出详细的滚动调试信息
    logger.info(
      `🎯 虚拟滚动执行: ${scrollInfo.method}, 距离=${scrollInfo.scrollDistance}px`
    );

    if (scrollInfo.method === 'window') {
      logger.info(
        `   window滚动: ${scrollInfo.beforeScroll} → ${scrollInfo.afterScroll} (目标${scrollInfo.targetScroll})`
      );
      logger.info(
        `   滚动进度: ${Math.round((scrollInfo.progress || 0) * 100)}%`
      );
    } else if (scrollInfo.method === 'container') {
      logger.info(
        `   容器滚动: ${scrollInfo.beforeScroll} → ${scrollInfo.afterScroll} (目标${scrollInfo.targetScroll})`
      );
      logger.info(
        `   滚动进度: ${Math.round((scrollInfo.progress || 0) * 100)}%`
      );
    } else if (scrollInfo.method === 'container-fallback-window') {
      logger.info(
        `   容器滚动失败，回退到window: ${scrollInfo.windowBefore} → ${scrollInfo.windowAfter}`
      );
    }

    // 输出容器分析信息
    if (scrollInfo.analysis?.details) {
      const details = scrollInfo.analysis.details;
      logger.info(`   容器信息: ${details.selector || 'window'}`);
      if (details.scrollHeight) {
        logger.info(
          `   尺寸: ${details.clientHeight}px(视口) / ${details.scrollHeight}px(总高)`
        );
      }
    }
  }

  /**
   * 计算自适应延迟时间
   */
  private calculateAdaptiveDelay(
    baseDelay: number,
    context: {
      consecutiveNoNewItems: number;
      stagnationCount: number;
      progressRatio: number;
    }
  ): number {
    let delay = baseDelay;

    // 根据连续无新项目情况调整
    if (context.consecutiveNoNewItems > 0) {
      delay += context.consecutiveNoNewItems * 500; // 每次无新项目增加0.5秒
    }

    // 根据停滞情况调整
    if (context.stagnationCount > 0) {
      delay += context.stagnationCount * 800; // 每次停滞增加0.8秒
    }

    // 根据进度调整
    if (context.progressRatio > 0.8) {
      delay += 1000; // 接近完成时增加等待时间
    }

    // 限制延迟范围
    return Math.min(Math.max(delay, 1000), 8000); // 1-8秒之间
  }

  /**
   * 输出虚拟列表收集统计信息
   */
  private logVirtualListCollectionStats(
    collectedItems: Map<string, any>,
    expectedTotal: number,
    scrollCount: number
  ): void {
    const totalCollected = collectedItems.size;
    const completionRate = Math.round((totalCollected / expectedTotal) * 100);

    logger.info('\n📈 虚拟列表收集统计:');
    logger.info(
      `   总收集数量: ${totalCollected}/${expectedTotal} (${completionRate}%)`
    );
    logger.info(`   滚动次数: ${scrollCount}`);
    logger.info(
      `   平均效率: ${Math.round(totalCollected / scrollCount)} 项/次滚动`
    );

    // 按时间段分析收集效率
    const timeSlots = new Map<number, number>();
    for (const [, item] of collectedItems) {
      const slot = Math.floor(item.scrollIteration / 10) * 10;
      timeSlots.set(slot, (timeSlots.get(slot) || 0) + 1);
    }

    if (timeSlots.size > 1) {
      logger.info('   收集效率分布:');
      for (const [slot, count] of timeSlots) {
        logger.info(`     第${slot + 1}-${slot + 10}次滚动: ${count}项`);
      }
    }
  }

  /**
   * 处理无限滚动加载，获取所有搜索结果
   */
  private async loadAllSearchResults(page: Page): Promise<void> {
    const scrollConfig = this.config.scrollConfig;

    if (!scrollConfig?.enabled) {
      logger.info('滚动加载已禁用，跳过');
      return;
    }

    logger.info('开始处理分页滚动加载...');

    // 检测是否为虚拟列表
    const virtualListInfo = await this.detectVirtualList(page);

    if (virtualListInfo.isVirtualList) {
      logger.info(
        `检测到虚拟列表 (${virtualListInfo.framework})，期望项目数: ${virtualListInfo.expectedTotal}`
      );
      await this.loadVirtualListResults(page, virtualListInfo.expectedTotal);
      return;
    }

    // 对于非虚拟列表，使用简单的虚拟滚动策略
    logger.info('检测到传统列表，使用虚拟滚动策略');

    const maxScrolls = Math.min(scrollConfig.maxScrolls || 20, 20); // 限制最大滚动次数

    for (let i = 0; i < maxScrolls; i++) {
      logger.info(`执行第 ${i + 1}/${maxScrolls} 次虚拟滚动`);

      // 使用虚拟列表滚动策略
      await this.performVirtualListScroll(page);

      // 等待内容加载
      await sleep(scrollConfig.scrollDelay || 2000);

      // 检查是否已经到达页面底部
      const isAtBottom = await page.evaluate(() => {
        const scrollY = window.scrollY;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        return scrollY + windowHeight >= documentHeight - 100; // 预留100px误差
      });

      if (isAtBottom) {
        logger.info('已到达页面底部，停止滚动');
        break;
      }
    }

    // 最终滚动到顶部，方便后续处理
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    logger.info('滚动加载完成');
  }

  /**
   * 从搜索页面提取结果列表
   */
  private async extractSearchResults(
    page: Page,
    keyword: string
  ): Promise<SearchResultItem[]> {
    const browserUseMode = this.config.aiConfig?.browserUseMode || 'hybrid';

    // Browser-Use 专用模式
    if (browserUseMode === 'browser-use-only' && this.browserUseAgent) {
      logger.info('使用 Browser-Use 专用模式提取搜索结果');
      return await this.browserUseAgent.extractSearchResults(page, keyword);
    }

    // 传统方式专用模式或混合模式的第一步
    let conventionalResults: SearchResultItem[] = [];

    // 混合模式：结合传统方式和Browser-Use的结果
    if (browserUseMode === 'hybrid' && this.browserUseAgent) {
      try {
        logger.info('开始混合模式：结合传统方式和Browser-Use提取');

        // 使用Browser-Use提取结果
        const browserUseResults =
          await this.browserUseAgent.extractSearchResults(page, keyword);
        logger.info(
          `Browser-Use 提取到 ${browserUseResults.length} 个搜索结果`
        );

        // 合并两种方式的结果，去重
        const combinedResults = this.mergeSearchResults(
          conventionalResults,
          browserUseResults
        );
        logger.info(`合并后共 ${combinedResults.length} 个搜索结果`);

        if (combinedResults.length > 0) {
          return combinedResults;
        }
      } catch (browserUseError) {
        logger.warn(
          `Browser-Use 提取搜索结果时出错: ${
            (browserUseError as Error).message
          }`
        );
      }
    }

    // 检查是否需要使用传统AI辅助提取搜索结果
    const shouldUseAI =
      this.shouldUseAIExtractionForSearch(conventionalResults);

    if (shouldUseAI && this.aiAnalyzer) {
      try {
        logger.info('开始传统AI辅助提取搜索结果');
        const htmlContent = await page.content();
        const mode = this.config.aiConfig?.extractionMode || 'fallback';

        if (mode === 'always') {
          // 总是使用AI提取模式
          logger.info('使用AI完全提取搜索结果');
          const aiResults = await this.aiAnalyzer.extractSearchResultsFromHTML(
            htmlContent,
            keyword
          );

          if (aiResults.length > 0) {
            logger.info(
              `AI成功提取 ${aiResults.length} 个搜索结果，常规提取 ${conventionalResults.length} 个`
            );
            return aiResults;
          } else {
            logger.warn('AI提取搜索结果失败，使用常规提取结果');
            return conventionalResults;
          }
        } else if (mode === 'enhance') {
          // AI增强模式
          logger.info('使用AI增强搜索结果');
          const enhancedResults = await this.aiAnalyzer.enhanceSearchResults(
            conventionalResults,
            htmlContent,
            keyword
          );
          return enhancedResults;
        } else if (mode === 'fallback') {
          // 仅当常规提取失败或结果太少时使用AI
          if (conventionalResults.length === 0) {
            logger.info('常规提取未找到结果，使用AI辅助提取');
            const aiResults =
              await this.aiAnalyzer.extractSearchResultsFromHTML(
                htmlContent,
                keyword
              );

            if (aiResults.length > 0) {
              logger.info(`AI fallback成功提取 ${aiResults.length} 个搜索结果`);
              return aiResults;
            }
          } else {
            logger.info(
              `常规提取找到 ${conventionalResults.length} 个结果，不需要AI辅助`
            );
          }
        }
      } catch (aiError) {
        logger.warn(`AI辅助提取搜索结果时出错: ${(aiError as Error).message}`);
      }
    }

    return conventionalResults;
  }

  /**
   * 合并两种方式提取的搜索结果，去除重复项
   */
  private mergeSearchResults(
    conventionalResults: SearchResultItem[],
    browserUseResults: SearchResultItem[]
  ): SearchResultItem[] {
    const merged: SearchResultItem[] = [];
    const titleMap = new Map<string, SearchResultItem>();

    // 首先添加传统结果
    for (const result of conventionalResults) {
      const titleKey = result.title.toLowerCase();
      titleMap.set(titleKey, result);
    }

    // 然后合并Browser-Use结果，智能处理重复项
    for (const result of browserUseResults) {
      const titleKey = result.title.toLowerCase();
      const existing = titleMap.get(titleKey);

      if (existing) {
        // 如果已存在，合并信息，优先使用更完整的信息
        const mergedResult: SearchResultItem = {
          title: result.title || existing.title,
          authors:
            result.authors.length > 0 ? result.authors : existing.authors,
          detailUrl: result.detailUrl || existing.detailUrl,
          abstract: result.abstract || existing.abstract,
        };
        titleMap.set(titleKey, mergedResult);
      } else {
        // 新结果，直接添加
        titleMap.set(titleKey, result);
      }
    }

    // 转换为数组返回
    return Array.from(titleMap.values());
  }

  /**
   * 判断是否应该使用AI辅助提取搜索结果
   */
  private shouldUseAIExtractionForSearch(
    conventionalResults: SearchResultItem[]
  ): boolean {
    if (!this.config.aiConfig?.enableExtraction || !this.aiAnalyzer) {
      return false;
    }

    const mode = this.config.aiConfig.extractionMode || 'fallback';

    switch (mode) {
      case 'always':
        return true;
      case 'enhance':
        return conventionalResults.length > 0; // 只有有结果时才增强
      case 'fallback':
        // 当没有找到结果或结果太少时使用AI
        return (
          conventionalResults.length === 0 ||
          conventionalResults.some((r) => !r.title || !r.authors.length)
        );
      default:
        return false;
    }
  }

  /**
   * 提取论文详细信息
   */
  private async extractPaperDetail(
    searchResult: SearchResultItem,
    keyword: string
  ): Promise<PaperInfo | null> {
    const detailPage = await this.createPage();

    try {
      logger.info(`访问详情页面: ${searchResult.detailUrl}`);
      await detailPage.goto(searchResult.detailUrl, {
        waitUntil: 'networkidle2',
      });
      await sleep(delays.pageLoad);

      // 首先尝试常规的CSS选择器提取
      const paperDetail = await detailPage.evaluate((selectors) => {
        const titleElement = document.querySelector(selectors.detailTitle);
        const title = titleElement?.textContent?.trim() || '';

        const authorsElement = document.querySelector(selectors.detailAuthors);
        const authorsText = authorsElement?.textContent?.trim() || '';

        const abstractElement = document.querySelector(
          selectors.detailAbstract
        );
        const abstract = abstractElement?.textContent?.trim() || '';

        const paperLinkElement = document.querySelector(
          selectors.detailPaperLink
        ) as HTMLAnchorElement;
        const paperLink = paperLinkElement?.href || '';

        return {
          title,
          authorsText,
          abstract,
          paperLink,
        };
      }, selectors);

      const title = cleanText(paperDetail.title || searchResult.title);
      const authors =
        parseAuthors(paperDetail.authorsText) || searchResult.authors;
      const abstract = cleanText(paperDetail.abstract);

      // 论文链接现在完全从详情页面提取
      const paperLink = getAbsoluteUrl(
        searchResult.detailUrl,
        paperDetail.paperLink
      );

      // 创建基础论文信息，优先使用详情页面的信息，但如果缺失则使用搜索结果中的信息
      let paperInfo: PaperInfo = {
        title,
        authors,
        abstract: abstract || (searchResult as any).abstract || '', // 使用搜索结果中的摘要作为后备
        paperLink,
        detailUrl: searchResult.detailUrl, // 添加详情页URL
        searchKeyword: keyword,
        crawledAt: new Date(),
      };

      // 记录论文链接来源
      if (paperDetail.paperLink) {
        logger.info(`从详情页面获取论文链接: ${paperLink}`);
      } else {
        logger.warn('详情页面未找到论文链接');
      }

      // 检查Browser-Use模式
      const browserUseMode = this.config.aiConfig?.browserUseMode || 'hybrid';

      // Browser-Use 专用模式
      if (browserUseMode === 'browser-use-only' && this.browserUseAgent) {
        try {
          logger.info('使用 Browser-Use 专用模式提取论文详情');
          const browserUseResult =
            await this.browserUseAgent.extractPaperDetail(
              detailPage,
              keyword,
              paperInfo
            );

          if (browserUseResult) {
            paperInfo = browserUseResult;
            logger.info(`Browser-Use 提取成功: ${paperInfo.title}`);
          } else {
            logger.warn('Browser-Use 提取失败，使用回退信息');
          }
        } catch (browserUseError) {
          logger.warn(
            `Browser-Use 提取详情失败: ${(browserUseError as Error).message}`
          );
        }
      }
      // 混合模式：Browser-Use + 传统AI
      else if (browserUseMode === 'hybrid' && this.browserUseAgent) {
        try {
          logger.info('使用混合模式提取论文详情');

          // 首先尝试Browser-Use
          const browserUseResult =
            await this.browserUseAgent.extractPaperDetail(
              detailPage,
              keyword,
              paperInfo
            );

          if (browserUseResult) {
            paperInfo = browserUseResult;
            logger.info(`Browser-Use 提取成功，继续传统AI增强`);
          }

          // 然后使用传统AI进行增强
          if (this.aiAnalyzer) {
            const htmlContent = await detailPage.content();
            const enhancedInfo = await this.aiAnalyzer.enhanceExtractedInfo(
              paperInfo,
              htmlContent
            );
            paperInfo = enhancedInfo;
            logger.info('传统AI增强完成');
          }
        } catch (error) {
          logger.warn(`混合模式提取失败: ${(error as Error).message}`);
        }
      }
      // 传统模式或Browser-Use失败时的处理
      else {
        // 检查是否需要使用传统AI辅助提取
        const shouldUseAI = this.shouldUseAIExtraction(paperInfo);

        console.log('shouldUseAI', shouldUseAI);

        if (shouldUseAI && this.aiAnalyzer) {
          try {
            // 获取页面HTML内容供AI分析
            const htmlContent = await detailPage.content();

            if (this.config.aiConfig?.extractionMode === 'always') {
              // 总是使用AI提取模式
              logger.info('使用传统AI辅助提取模式');
              const aiExtractedInfo =
                await this.aiAnalyzer.extractPaperInfoFromHTML(
                  htmlContent,
                  keyword,
                  paperInfo
                );

              if (aiExtractedInfo) {
                paperInfo = aiExtractedInfo;
                logger.info(`传统AI辅助提取成功: ${paperInfo.title}`);
              } else {
                logger.warn(`传统AI辅助提取失败，使用常规提取结果`);
              }
            } else if (this.config.aiConfig?.extractionMode === 'enhance') {
              // AI增强模式
              logger.info('使用传统AI增强提取结果');
              paperInfo = await this.aiAnalyzer.enhanceExtractedInfo(
                paperInfo,
                htmlContent
              );
            } else if (this.config.aiConfig?.extractionMode === 'fallback') {
              // 仅当常规提取失败时使用AI
              if (!title || !abstract) {
                logger.info('常规提取不完整，使用传统AI辅助提取');
                const aiExtractedInfo =
                  await this.aiAnalyzer.extractPaperInfoFromHTML(
                    htmlContent,
                    keyword,
                    paperInfo
                  );

                if (aiExtractedInfo) {
                  paperInfo = aiExtractedInfo;
                  logger.info(`传统AI辅助提取成功: ${paperInfo.title}`);
                }
              }
            }
          } catch (aiError) {
            logger.warn(
              `传统AI辅助提取过程中出错: ${(aiError as Error).message}`
            );
          }
        }
      }

      // 验证最终结果
      if (!paperInfo.title) {
        throw new Error('无法提取论文标题');
      }

      // 翻译摘要（如果启用了翻译功能）
      if (paperInfo.abstract && this.config.aiConfig?.enableTranslation) {
        try {
          paperInfo.abstract = await this.translateAbstract(paperInfo.abstract);
        } catch (error) {
          logger.warn(`翻译摘要失败: ${(error as Error).message}`);
          // 翻译失败不影响整体流程，继续使用原摘要
        }
      }

      // 🎯 在收集完 abstract 和 paperLink 后，打印完整的 result
      logger.info('📄 完整论文信息收集完成:');
      logger.info(`📄 标题: ${paperInfo.title}`);
      logger.info(`📄 作者: ${paperInfo.authors.join(', ')}`);
      logger.info(
        `📄 摘要: ${paperInfo.abstract.substring(0, 200)}${
          paperInfo.abstract.length > 200 ? '...' : ''
        }`
      );
      logger.info(`📄 论文链接: ${paperInfo.paperLink}`);
      logger.info(`📄 详情页链接: ${paperInfo.detailUrl}`);
      logger.info(`📄 搜索关键词: ${paperInfo.searchKeyword}`);
      logger.info(`📄 抓取时间: ${paperInfo.crawledAt.toISOString()}`);
      logger.info('📄 ====================================');

      return paperInfo;
    } catch (error) {
      logger.error(
        `提取论文详情失败: ${searchResult.detailUrl} - ${
          (error as Error).message
        }`
      );
      throw error;
    } finally {
      await detailPage.close();
    }
  }

  /**
   * 翻译摘要内容
   */
  private async translateAbstract(abstract: string): Promise<string> {
    if (!abstract || !this.config.aiConfig?.enableTranslation) {
      return abstract;
    }

    try {
      logger.info('开始翻译摘要...');

      // 创建简单的ChatOpenAI实例用于翻译
      const { ChatOpenAI } = await import('@langchain/openai');
      const llm = new ChatOpenAI({
        apiKey: this.config.aiConfig.apiKey || process.env.OPENAI_API_KEY,
        modelName: this.config.aiConfig.model,
        temperature: 0.3,
        maxTokens: 2000,
        ...(this.config.aiConfig.baseURL && {
          openAIApiKey:
            this.config.aiConfig.apiKey || process.env.OPENAI_API_KEY,
          configuration: {
            baseURL: this.config.aiConfig.baseURL,
          },
        }),
      });

      const translationPrompt = `
请分析以下学术论文摘要的语言，如果是非中文内容，请翻译成中文，并按照以下格式返回：

原文：
[原始摘要内容]

中文翻译：
[中文翻译内容]

如果原文已经是中文，请直接返回原文。

摘要内容：
${abstract}

要求：
1. 保持学术用语的准确性
2. 翻译要流畅自然
3. 专业术语要准确
4. 如果原文是中文，直接返回原文，不要添加"原文："等标签
`;

      const response = await llm.invoke([
        { content: translationPrompt, role: 'user' },
      ]);

      const translatedContent = response.content.toString().trim();

      // 检查是否需要翻译（如果AI返回的内容包含"原文："说明进行了翻译）
      if (
        translatedContent.includes('原文：') &&
        translatedContent.includes('中文翻译：')
      ) {
        logger.info('摘要翻译完成');
        return translatedContent;
      } else {
        // 如果是中文内容，直接返回原文
        logger.info('摘要已是中文，无需翻译');
        return abstract;
      }
    } catch (error) {
      logger.warn(`翻译摘要失败: ${(error as Error).message}`);
      return abstract; // 翻译失败时返回原文
    }
  }

  /**
   * 判断是否应该使用AI辅助提取
   */
  private shouldUseAIExtraction(paperInfo: PaperInfo): boolean {
    if (!this.config.aiConfig?.enableExtraction || !this.aiAnalyzer) {
      return false;
    }

    const mode = this.config.aiConfig.extractionMode || 'fallback';

    switch (mode) {
      case 'always':
        return true;
      case 'enhance':
        return true;
      case 'fallback':
        // 当标题、作者或摘要缺失时使用AI
        return (
          !paperInfo.title ||
          !paperInfo.authors.length ||
          !paperInfo.abstract ||
          paperInfo.abstract.length < 50
        ); // 摘要太短
      default:
        return false;
    }
  }

  /**
   * 保存结果到文件
   */
  async saveResults(papers: PaperInfo[], keyword: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `papers-${keyword}-${timestamp}`;

    if (this.config.outputFormat === 'csv') {
      return await this.saveToCsv(papers, filename);
    } else {
      return await this.saveToJson(papers, filename);
    }
  }

  /**
   * 保存为CSV格式
   */
  private async saveToCsv(
    papers: PaperInfo[],
    filename: string
  ): Promise<string> {
    const csvPath = path.join(this.config.outputPath, `${filename}.csv`);

    // 构建CSV头部，包含AI分析字段
    const headers = [
      { id: 'title', title: '论文标题' },
      { id: 'authors', title: '作者' },
      { id: 'abstract', title: '摘要' },
      { id: 'paperLink', title: '论文链接' },
      { id: 'detailUrl', title: '详情页链接' },
      { id: 'searchKeyword', title: '搜索关键词' },
      { id: 'crawledAt', title: '抓取时间' },
    ];

    // 如果有AI分析结果，添加相应的列
    const hasAIAnalysis = papers.some((p) => p.aiAnalysis);
    if (hasAIAnalysis) {
      headers.push(
        { id: 'aiSummary', title: 'AI总结' },
        { id: 'aiClassification', title: 'AI分类' },
        { id: 'aiKeywords', title: 'AI关键词' },
        { id: 'aiSentiment', title: 'AI情感分析' },
        { id: 'aiRelevanceScore', title: 'AI相关性评分' },
        { id: 'aiModel', title: 'AI模型' },
        { id: 'aiProcessedAt', title: 'AI处理时间' }
      );
    }

    const csvWriter = createCsvWriter.createObjectCsvWriter({
      path: csvPath,
      header: headers,
      encoding: 'utf8',
    });

    const csvData = papers.map((paper) => {
      const baseData = {
        title: paper.title,
        authors: paper.authors.join('; '),
        abstract: paper.abstract,
        paperLink: paper.paperLink,
        detailUrl: paper.detailUrl,
        searchKeyword: paper.searchKeyword,
        crawledAt: paper.crawledAt.toISOString(),
      };

      // 添加AI分析数据（如果存在）
      if (paper.aiAnalysis) {
        return {
          ...baseData,
          aiSummary: paper.aiAnalysis.summary || '',
          aiClassification: paper.aiAnalysis.classification || '',
          aiKeywords: paper.aiAnalysis.keywords?.join('; ') || '',
          aiSentiment: paper.aiAnalysis.sentiment || '',
          aiRelevanceScore: paper.aiAnalysis.relevanceScore?.toString() || '',
          aiModel: paper.aiAnalysis.model || '',
          aiProcessedAt: paper.aiAnalysis.processedAt?.toISOString() || '',
        };
      }

      return baseData;
    });

    await csvWriter.writeRecords(csvData);
    logger.info(`结果已保存到CSV文件: ${csvPath}`);

    return csvPath;
  }

  /**
   * 保存为JSON格式
   */
  private async saveToJson(
    papers: PaperInfo[],
    filename: string
  ): Promise<string> {
    const jsonPath = path.join(this.config.outputPath, `${filename}.json`);

    const jsonData = {
      searchKeyword: this.status.keyword,
      crawledAt: new Date().toISOString(),
      totalCount: papers.length,
      papers: papers,
    };

    await fs.promises.writeFile(
      jsonPath,
      JSON.stringify(jsonData, null, 2),
      'utf8'
    );
    logger.info(`结果已保存到JSON文件: ${jsonPath}`);

    return jsonPath;
  }

  /**
   * 获取爬虫状态
   */
  getStatus(): CrawlerStatus {
    return { ...this.status };
  }

  /**
   * 启用或禁用 AI 分析
   */
  enableAI(enabled: boolean): void {
    if (!this.config.aiConfig) {
      logger.warn('AI 配置不存在，无法启用 AI 分析');
      return;
    }

    this.config.aiConfig.enabled = enabled;

    if (enabled && !this.aiAnalyzer) {
      this.aiAnalyzer = createPaperAnalyzer(this.config.aiConfig);
      logger.info('AI 分析器已启用');
    } else if (!enabled) {
      this.aiAnalyzer = null;
      logger.info('AI 分析器已禁用');
    }
  }

  /**
   * 检查 AI 服务可用性
   */
  async checkAIAvailability(): Promise<boolean> {
    if (!this.aiAnalyzer) {
      return false;
    }

    return await this.aiAnalyzer.checkAvailability();
  }

  /**
   * 获取 AI 配置
   */
  getAIConfig() {
    return this.config.aiConfig;
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('浏览器已关闭');
    }
  }
}
