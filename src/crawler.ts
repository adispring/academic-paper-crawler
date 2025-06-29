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
              paperLink: result.paperLink || result.detailUrl, // 使用论文链接或详情页链接
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
   * 模拟人类式平滑滚动行为
   */
  private async performHumanLikeScroll(
    page: Page,
    mode: 'normal' | 'aggressive' = 'normal'
  ): Promise<void> {
    const scrollConfig = this.config.scrollConfig;

    if (!scrollConfig?.humanLike) {
      // 如果没有启用人类式滚动，使用简单滚动
      logger.info('人类式滚动已禁用，使用传统滚动方式');
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      return;
    }

    // 根据模式和配置确定滚动参数
    const scrollStepsMin = scrollConfig.scrollStepsMin || 3;
    const scrollStepsMax = scrollConfig.scrollStepsMax || 6;
    const stepDelayMin = scrollConfig.stepDelayMin || 800;
    const stepDelayMax = scrollConfig.stepDelayMax || 1800;
    const backscrollChance = scrollConfig.backscrollChance || 0.3;

    const scrollSteps =
      mode === 'aggressive'
        ? Math.max(scrollStepsMin, scrollStepsMax)
        : Math.floor(Math.random() * (scrollStepsMax - scrollStepsMin + 1)) +
          scrollStepsMin;

    logger.info(
      `开始人类式${
        mode === 'aggressive' ? '深度' : '常规'
      }滚动，共${scrollSteps}步`
    );

    // 获取当前页面高度和视窗高度
    const { viewportHeight, totalHeight } = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      totalHeight: Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      ),
    }));

    const currentScrollY = await page.evaluate(() => window.scrollY);
    const remainingHeight = totalHeight - currentScrollY - viewportHeight;

    if (remainingHeight <= 0) {
      logger.info('已到达页面底部，无需继续滚动');
      return;
    }

    // 计算每步滚动的距离
    const baseScrollDistance = Math.min(
      viewportHeight * 0.6,
      remainingHeight / scrollSteps
    );

    for (let i = 0; i < scrollSteps; i++) {
      // 添加随机性，模拟人类不均匀的滚动行为
      const randomFactor = 0.7 + Math.random() * 0.6; // 0.7 到 1.3 的随机因子
      const scrollDistance = Math.floor(baseScrollDistance * randomFactor);

      // 模拟人类的滚动行为 - 平滑滚动而不是瞬间跳跃
      await page.evaluate((distance) => {
        return new Promise<void>((resolve) => {
          const startY = window.scrollY;
          const targetY = startY + distance;
          const duration = 300 + Math.random() * 400; // 300-700ms的滚动时间
          let startTime: number;

          function animateScroll(currentTime: number) {
            if (!startTime) startTime = currentTime;
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 使用缓动函数模拟自然滚动
            const easeInOutQuad =
              progress < 0.5
                ? 2 * progress * progress
                : -1 + (4 - 2 * progress) * progress;

            const currentY = startY + (targetY - startY) * easeInOutQuad;
            window.scrollTo(0, currentY);

            if (progress < 1) {
              requestAnimationFrame(animateScroll);
            } else {
              resolve();
            }
          }

          requestAnimationFrame(animateScroll);
        });
      }, scrollDistance);

      // 模拟人类在滚动后的停顿时间
      const pauseTime =
        stepDelayMin + Math.random() * (stepDelayMax - stepDelayMin); // 随机停顿时间
      logger.info(
        `滚动步骤 ${i + 1}/${scrollSteps}，停顿 ${Math.round(pauseTime)}ms`
      );
      await sleep(pauseTime);

      // 检查是否有新内容加载指示器
      const hasLoadingIndicator = await page.evaluate(() => {
        const indicators = [
          '.loading',
          '.spinner',
          '[class*="loading"]',
          '[class*="spinner"]',
          '.load-more',
          '[class*="load"]',
          '.btn-more',
        ];

        return indicators.some((selector) => {
          const el = document.querySelector(selector) as HTMLElement;
          return el && el.offsetParent !== null;
        });
      });

      if (hasLoadingIndicator) {
        logger.info('检测到加载指示器，额外等待内容加载...');
        await sleep(1500 + Math.random() * 1000); // 1.5-2.5秒额外等待
      }

      // 模拟人类查看内容的行为 - 偶尔向上滚动一点点
      if (
        i > 0 &&
        scrollConfig.randomBackscroll &&
        Math.random() < backscrollChance
      ) {
        logger.info('模拟人类回看行为，微向上滚动');
        await page.evaluate(() => {
          const backScroll = 50 + Math.random() * 100; // 50-150px
          window.scrollBy(0, -backScroll);
        });
        await sleep(300 + Math.random() * 200);

        // 然后继续向下
        await page.evaluate(() => {
          const forwardScroll = 80 + Math.random() * 120; // 80-200px
          window.scrollBy(0, forwardScroll);
        });
        await sleep(200);
      }
    }

    // 最后尝试滚动到真正的底部，但依然保持平滑
    logger.info('完成渐进滚动，尝试到达页面底部...');
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const startY = window.scrollY;
        const targetY =
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          ) - window.innerHeight;

        if (targetY <= startY) {
          resolve();
          return;
        }

        const duration = 1000 + Math.random() * 500; // 1-1.5秒滚动到底部
        let startTime: number;

        function animateScroll(currentTime: number) {
          if (!startTime) startTime = currentTime;
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          const easeOutQuad = 1 - (1 - progress) * (1 - progress);
          const currentY = startY + (targetY - startY) * easeOutQuad;
          window.scrollTo(0, currentY);

          if (progress < 1) {
            requestAnimationFrame(animateScroll);
          } else {
            resolve();
          }
        }

        requestAnimationFrame(animateScroll);
      });
    });

    // 到底后稍作停留
    await sleep(800 + Math.random() * 400);
    logger.info('人类式滚动完成');
  }

  /**
   * 检测虚拟列表并返回相关信息
   */
  private async detectVirtualList(page: Page): Promise<{
    isVirtualList: boolean;
    expectedTotal: number;
    framework?: string;
    virtualScrollerHeight?: number;
  }> {
    return await page.evaluate(() => {
      // 检测虚拟列表组件
      const hasVirtualScroller = !!document.querySelector('virtual-scroller');
      const hasTotalPadding = !!document.querySelector(
        '.total-padding, [class*="total-padding"]'
      );
      const hasScrollableContent = !!document.querySelector(
        '.scrollable-content, [class*="scrollable-content"]'
      );

      // 检测期望总数
      let expectedTotal = 0;
      const contentTabs = document.querySelectorAll(
        '[role="tab"], .tab, .nav-tab, .tab-link'
      );
      for (const tab of Array.from(contentTabs)) {
        const tabText = tab.textContent || '';
        const contentMatch = tabText.match(/Content\s*\((\d+)\)/);
        if (contentMatch) {
          expectedTotal = parseInt(contentMatch[1]);
          break;
        }
      }

      // 检测框架
      let framework: string | undefined;
      if (hasVirtualScroller) {
        framework = 'Angular CDK Virtual Scrolling';
      }

      // 获取虚拟滚动容器高度
      let virtualScrollerHeight = 0;
      if (hasVirtualScroller) {
        const virtualScroller = document.querySelector(
          'virtual-scroller'
        ) as HTMLElement;
        if (virtualScroller) {
          virtualScrollerHeight = virtualScroller.scrollHeight;
        }
      }

      const isVirtualList =
        hasVirtualScroller || (hasTotalPadding && hasScrollableContent);

      return {
        isVirtualList,
        expectedTotal,
        framework,
        virtualScrollerHeight,
      };
    });
  }

  /**
   * 虚拟列表专用的滚动加载处理
   */
  private async loadVirtualListResults(
    page: Page,
    expectedTotal: number
  ): Promise<void> {
    logger.info(`开始处理虚拟列表滚动加载，期望总数: ${expectedTotal}`);

    const scrollConfig = this.config.scrollConfig;

    if (!scrollConfig?.virtualListOptimization) {
      logger.info('虚拟列表优化已禁用，将使用传统滚动策略处理');
      // 这里不返回，而是继续使用传统的滚动逻辑
      return;
    }

    const collectedItems = new Set<string>();
    let scrollCount = 0;
    const maxScrolls = 50; // 固定为50次滚动
    let noNewItemsCount = 0;
    const maxNoNewRetries = scrollConfig.virtualListMaxRetries || 6;

    while (scrollCount < maxScrolls && noNewItemsCount < maxNoNewRetries) {
      // 收集当前可见的项目
      const currentItems = await page.evaluate(() => {
        const items: string[] = [];

        // 针对SIGCHI网站的选择器
        const selectors = [
          'content-card',
          '.search-item',
          '.result-item',
          '.paper-item',
          'article',
          '[class*="card"]',
        ];

        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            Array.from(elements).forEach((el) => {
              // 提取唯一标识符（通常是详情页链接）
              const detailLink = el.querySelector(
                'a[href*="content"], a[href*="program"]'
              );
              if (detailLink) {
                const href = (detailLink as HTMLAnchorElement).href;
                if (href) {
                  items.push(href);
                }
              }
            });
            break; // 找到有效选择器就停止
          }
        }

        return items;
      });

      // 检查新收集的项目
      const newItemsCount = currentItems.filter(
        (item) => !collectedItems.has(item)
      ).length;

      if (newItemsCount > 0) {
        currentItems.forEach((item) => collectedItems.add(item));
        noNewItemsCount = 0;
        logger.info(
          `虚拟列表收集: 新增 ${newItemsCount} 项，总计 ${
            collectedItems.size
          }/${expectedTotal} (${Math.round(
            (collectedItems.size / expectedTotal) * 100
          )}%)`
        );
      } else {
        noNewItemsCount++;
        logger.info(`虚拟列表: 连续 ${noNewItemsCount} 次无新项目`);
      }

      // 如果已收集到期望数量的阈值以上，可以提前结束
      const threshold = scrollConfig.virtualListCollectionThreshold || 0.85;
      if (collectedItems.size >= expectedTotal * threshold) {
        logger.info(
          `虚拟列表: 已收集 ${
            collectedItems.size
          }/${expectedTotal} (${Math.round(
            (collectedItems.size / expectedTotal) * 100
          )}%)，达到阈值 ${Math.round(threshold * 100)}%，提前结束`
        );
        break;
      }

      if (noNewItemsCount >= maxNoNewRetries) {
        logger.info('虚拟列表: 已达到最大无新项目重试次数');
        break;
      }

      // 执行针对虚拟列表优化的滚动
      await this.performVirtualListScroll(page);

      // 虚拟列表需要更长的等待时间让DOM更新
      const scrollDelay =
        scrollConfig?.virtualListScrollDelay ||
        scrollConfig?.scrollDelay ||
        3500;
      await sleep(scrollDelay);
      scrollCount++;
    }

    logger.info(
      `虚拟列表收集完成: ${collectedItems.size}/${expectedTotal} 项，共滚动 ${scrollCount} 次`
    );
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
   * 处理无限滚动加载，获取所有搜索结果
   */
  private async loadAllSearchResults(page: Page): Promise<void> {
    const scrollConfig = this.config.scrollConfig;

    if (!scrollConfig?.enabled) {
      logger.info('滚动加载已禁用，跳过');
      return;
    }

    logger.info('开始处理分页滚动加载...');

    // 首先检测是否为虚拟列表
    const virtualListInfo = await this.detectVirtualList(page);

    if (virtualListInfo.isVirtualList) {
      logger.info(
        `检测到虚拟列表 (${virtualListInfo.framework})，期望项目数: ${virtualListInfo.expectedTotal}`
      );
      await this.loadVirtualListResults(page, virtualListInfo.expectedTotal);
      return;
    }

    // 传统列表的滚动逻辑（保持原有逻辑）
    logger.info('检测到传统列表，使用标准滚动策略');

    let previousResultCount = 0;
    let currentResultCount = 0;
    let noNewContentCount = 0;
    const maxRetries = scrollConfig.maxRetries;
    const maxScrolls = scrollConfig.maxScrolls;
    let scrollCount = 0;

    while (scrollCount < maxScrolls && noNewContentCount < maxRetries) {
      // 获取当前结果数量 - 使用多种方式检测
      const detectionResult = await page.evaluate((selectors) => {
        // 方法1: 尝试从Content标签的数字获取总数
        let expectedTotal = 0;
        const contentTabs = Array.from(
          document.querySelectorAll('[role="tab"], .tab, .nav-tab, .tab-link')
        );
        for (const tab of contentTabs) {
          const tabText = tab.textContent || '';
          const contentMatch = tabText.match(/Content\s*\((\d+)\)/);
          if (contentMatch) {
            expectedTotal = parseInt(contentMatch[1]);
            console.log(`从Content标签检测到总数: ${expectedTotal}`);
            break;
          }
        }

        // 方法2: 更精确的搜索结果检测
        let maxCount = 0;
        const preciseSelectors = [
          // SIGCHI特定选择器
          '.tab-content [class*="row"] > div',
          '.content-panel > div',
          '[role="tabpanel"] > div',
          // 通用论文条目选择器
          'article',
          '.paper-item',
          '.content-item',
          '.result-item',
          '.search-result',
          '.publication',
          // 包含论文标题的div
          'div:has(h3)',
          'div:has(h4)',
          'div:has(h5)',
          'div:has(.title)',
          'div:has(strong)',
        ];

        for (const selector of preciseSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            const validElements = Array.from(elements).filter((el) => {
              const text = el.textContent || '';
              const hasTitle = text.length > 20; // 有足够的文本内容
              const hasAuthors = /[A-Z][a-z]+\s+[A-Z]/.test(text); // 包含人名模式
              const isVisible = window.getComputedStyle(el).display !== 'none';
              return hasTitle && hasAuthors && isVisible;
            });

            if (validElements.length > maxCount) {
              maxCount = validElements.length;
              console.log(
                `选择器 "${selector}" 找到 ${validElements.length} 个有效论文条目`
              );
            }
          } catch (e) {
            // 忽略无效选择器
          }
        }

        // 方法3: 直接检测包含论文信息的div
        const allDivs = Array.from(document.querySelectorAll('div'));
        let paperDivs = 0;
        for (const div of allDivs) {
          const text = div.textContent || '';
          const hasLink = div.querySelector('a[href*="content"]');
          const hasTitlePattern = /^[A-Z].{20,}$/m.test(text.trim());
          const hasAuthorPattern = /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text);

          if (
            hasLink &&
            hasTitlePattern &&
            hasAuthorPattern &&
            text.length > 50 &&
            text.length < 1000
          ) {
            paperDivs++;
          }
        }

        if (paperDivs > maxCount) {
          maxCount = paperDivs;
          console.log(`通过内容分析找到 ${paperDivs} 个论文条目`);
        }

        console.log(`期望总数: ${expectedTotal}, 实际检测: ${maxCount}`);
        return { expectedTotal, actualCount: maxCount };
      }, selectors);

      currentResultCount = detectionResult.actualCount;
      const expectedTotal = detectionResult.expectedTotal;

      logger.info(
        `当前已加载 ${currentResultCount} 个搜索结果（期望 ${expectedTotal} 个，滚动第 ${
          scrollCount + 1
        } 次）`
      );

      // 如果结果数量没有增加，说明可能已经加载完成
      if (currentResultCount === previousResultCount) {
        noNewContentCount++;
        logger.info(`连续 ${noNewContentCount} 次无新内容加载`);

        if (noNewContentCount >= maxRetries) {
          logger.info('已达到最大重试次数，停止滚动加载');
          break;
        }
      } else {
        noNewContentCount = 0; // 重置计数器
      }

      // 使用人类式平滑滚动策略
      if (expectedTotal > 0 && currentResultCount < expectedTotal * 0.8) {
        logger.info(`检测到大量未加载内容，使用人类式深度滚动策略`);
        await this.performHumanLikeScroll(page, 'aggressive');
      } else {
        logger.info(`执行人类式常规滚动`);
        await this.performHumanLikeScroll(page, 'normal');
      }

      // 等待新内容加载和处理
      await sleep(scrollConfig.scrollDelay);

      // 检查是否有加载指示器
      const isLoading = await page.evaluate((selectors) => {
        const loadingIndicator = document.querySelector(
          selectors.loadingIndicator
        ) as HTMLElement;
        return loadingIndicator && loadingIndicator.offsetParent !== null;
      }, selectors);

      if (isLoading) {
        logger.info('检测到加载指示器，等待加载完成...');
        // 等待加载指示器消失
        try {
          await page.waitForFunction(
            (selectors) => {
              const loadingIndicator = document.querySelector(
                selectors.loadingIndicator
              ) as HTMLElement;
              return (
                !loadingIndicator || loadingIndicator.offsetParent === null
              );
            },
            { timeout: 10000 },
            selectors
          );
        } catch (error) {
          logger.warn('等待加载指示器消失超时，继续进行');
        }
      }

      // 检查是否有"加载更多"按钮需要点击（如果启用了检测）
      if (scrollConfig.detectLoadMore) {
        const loadMoreSelectors = [
          'button:has-text("加载更多")',
          'button:has-text("Load More")',
          'button:has-text("Show More")',
          'button:has-text("更多")',
          '.load-more',
          '.more-results',
          '.show-more',
          '[data-action="load-more"]',
          '[onclick*="loadMore"]',
          '[onclick*="more"]',
        ];

        for (const selector of loadMoreSelectors) {
          try {
            const loadMoreButton = await page.$(selector);
            if (loadMoreButton) {
              const isVisible = await page.evaluate((el) => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              }, loadMoreButton);

              if (isVisible) {
                logger.info(`发现"加载更多"按钮: ${selector}，尝试点击`);
                await loadMoreButton.click();
                await sleep(delays.pageLoad);
                break; // 找到并点击后跳出循环
              }
            }
          } catch (error) {
            // 继续尝试下一个选择器
          }
        }
      }

      previousResultCount = currentResultCount;
      scrollCount++;

      // 额外等待，确保内容完全加载
      await sleep(delays.betweenRequests / 2);
    }

    // 最终滚动到顶部，方便后续处理
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    const finalCount = await page.evaluate((selectors) => {
      const elements = document.querySelectorAll(selectors.searchResults);
      return elements.length;
    }, selectors);

    logger.info(
      `滚动加载完成，共加载了 ${finalCount} 个搜索结果项（滚动 ${scrollCount} 次）`
    );
  }

  /**
   * 从搜索页面提取结果列表
   */
  private async extractSearchResults(
    page: Page,
    keyword: string
  ): Promise<SearchResultItem[]> {
    // 首先处理分页滚动，加载所有搜索结果
    await this.loadAllSearchResults(page);

    const browserUseMode = this.config.aiConfig?.browserUseMode || 'hybrid';

    // Browser-Use 专用模式
    if (browserUseMode === 'browser-use-only' && this.browserUseAgent) {
      logger.info('使用 Browser-Use 专用模式提取搜索结果');
      return await this.browserUseAgent.extractSearchResults(page, keyword);
    }

    // 传统方式专用模式或混合模式的第一步
    let conventionalResults: SearchResultItem[] = [];

    if (browserUseMode !== 'browser-use-only') {
      // 首先尝试常规CSS选择器提取
      conventionalResults = await page.evaluate((selectors) => {
        const results: SearchResultItem[] = [];
        const resultElements = document.querySelectorAll(
          selectors.searchResults
        );

        resultElements.forEach((element) => {
          try {
            // 更精确的标题提取
            let title = '';
            const titleSelectors = [
              'h3 a',
              'h4 a',
              'h5 a', // 标题链接
              'h3',
              'h4',
              'h5', // 直接标题
              '.title a',
              '.paper-title a', // 类名标题链接
              '.title',
              '.paper-title', // 直接类名标题
              'a[href*="content"]', // SIGCHI特定链接
              'strong',
              'b', // 粗体文本
            ];

            for (const selector of titleSelectors) {
              const titleEl = element.querySelector(selector);
              if (titleEl?.textContent?.trim()) {
                title = titleEl.textContent.trim();
                // 清理标题：移除多余的空白和换行
                title = title.replace(/\s+/g, ' ').trim();
                // 如果标题看起来合理（长度>10且不包含过多数字）
                if (
                  title.length > 10 &&
                  !/^\d+$/.test(title) &&
                  !title.includes('Papers') &&
                  !title.includes('Tutorial')
                ) {
                  break;
                }
              }
            }

            // 更精确的作者提取
            let authors: string[] = [];
            const authorSelectors = [
              '.author-list',
              '.authors',
              '.author', // 标准作者类
              '.byline',
              '.credits', // 署名行
              'small',
              '.text-muted', // 小字文本
              '.secondary-text', // 次要文本
              'span[class*="author"]', // 包含author的span
              'div[class*="author"]', // 包含author的div
            ];

            for (const selector of authorSelectors) {
              const authorsEl = element.querySelector(selector);
              if (authorsEl?.textContent?.trim()) {
                const authorsText = authorsEl.textContent.trim();
                // 清理和分割作者
                const cleanAuthorsText = authorsText
                  .replace(/\s+/g, ' ')
                  .trim();
                if (cleanAuthorsText && cleanAuthorsText.length > 2) {
                  authors = cleanAuthorsText
                    .split(/[,;]|\s+,\s+/)
                    .map((a) => a.trim())
                    .filter((a) => a.length > 1 && !a.match(/^\d+$/));
                  if (authors.length > 0) break;
                }
              }
            }

            // 如果还没找到作者，尝试在子元素中查找
            if (authors.length === 0) {
              const allText = element.textContent || '';
              const lines = allText
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line);

              // 寻找包含人名的行（通常包含大写字母开头的词）
              for (const line of lines) {
                if (
                  line.length > 5 &&
                  line.length < 200 &&
                  /[A-Z][a-z]+\s+[A-Z]/.test(line) &&
                  !line.includes('Papers') &&
                  !line.includes('Tutorial')
                ) {
                  authors = line
                    .split(/[,;]|\s+,\s+/)
                    .map((a) => a.trim())
                    .filter((a) => a.length > 2);
                  if (authors.length > 0) break;
                }
              }
            }

            const linkElement = element.querySelector(
              selectors.detailLink
            ) as HTMLAnchorElement;
            const detailUrl = linkElement?.href || '';

            // 尝试提取论文链接（左上角或左侧图标链接或其他位置）
            let paperLink = '';

            // 更全面的论文链接检测策略
            const paperLinkStrategies = [
              // 策略1: 直接查找常见的论文链接
              () => {
                const directSelectors = [
                  'a[href*="pdf"]',
                  'a[href*="doi"]',
                  'a[href*="acm.org"]',
                  'a[href*="dl.acm.org"]',
                  'a[href*="arxiv"]',
                  'a[href*="paper"]',
                  'a[href*="download"]',
                ];

                for (const selector of directSelectors) {
                  const linkEl = element.querySelector(
                    selector
                  ) as HTMLAnchorElement;
                  if (linkEl?.href && linkEl.href !== detailUrl) {
                    return linkEl.href;
                  }
                }
                return null;
              },

              // 策略2: 查找带有特殊属性的链接
              () => {
                const attrSelectors = [
                  'a[title*="PDF"]',
                  'a[title*="paper"]',
                  'a[title*="DOI"]',
                  'a[title*="download"]',
                  'a[title*="external"]',
                  'a[target="_blank"]',
                  'a[rel*="external"]',
                ];

                for (const selector of attrSelectors) {
                  const linkEl = element.querySelector(
                    selector
                  ) as HTMLAnchorElement;
                  if (linkEl?.href && linkEl.href !== detailUrl) {
                    return linkEl.href;
                  }
                }
                return null;
              },

              // 策略3: 查找图标链接（可能在左上角或左侧）
              () => {
                const iconSelectors = [
                  'a .fa',
                  'a .icon',
                  'a .glyphicon',
                  '.fa-external-link',
                  '.fa-link',
                  '.fa-file-pdf',
                  '.icon-link',
                  '.link-icon',
                  'a.icon',
                ];

                for (const selector of iconSelectors) {
                  const iconEl = element.querySelector(selector);
                  if (iconEl) {
                    const linkEl = iconEl.closest('a') as HTMLAnchorElement;
                    if (linkEl?.href && linkEl.href !== detailUrl) {
                      return linkEl.href;
                    }
                  }
                }
                return null;
              },

              // 策略4: 查找按钮样式的链接
              () => {
                const buttonSelectors = [
                  '.btn-link',
                  '.link-button',
                  '.paper-link',
                  '.external-link',
                  '.pdf-link',
                ];

                for (const selector of buttonSelectors) {
                  const linkEl = element.querySelector(
                    selector
                  ) as HTMLAnchorElement;
                  if (linkEl?.href && linkEl.href !== detailUrl) {
                    return linkEl.href;
                  }
                }
                return null;
              },

              // 策略5: 在元素左上角或左侧查找所有链接
              () => {
                const allLinks = Array.from(element.querySelectorAll('a'));
                for (const link of allLinks) {
                  const linkEl = link as HTMLAnchorElement;
                  if (!linkEl.href || linkEl.href === detailUrl) continue;

                  // 检查链接的位置（可能在左上角或左侧）
                  const rect = linkEl.getBoundingClientRect();
                  const parentRect = element.getBoundingClientRect();

                  // 如果链接在父元素的左上区域
                  const isRightSide =
                    rect.left > parentRect.left + parentRect.width * 0.7;
                  const isTopSide =
                    rect.top < parentRect.top + parentRect.height * 0.3;

                  if (isRightSide && isTopSide) {
                    return linkEl.href;
                  }

                  // 或者检查链接是否包含论文相关的URL模式
                  if (
                    /\.(pdf|doi|paper|download)/i.test(linkEl.href) ||
                    /(acm\.org|arxiv|doi\.org)/i.test(linkEl.href)
                  ) {
                    return linkEl.href;
                  }
                }
                return null;
              },
            ];

            // 逐个尝试策略
            for (let i = 0; i < paperLinkStrategies.length; i++) {
              try {
                const result = paperLinkStrategies[i]();
                if (result) {
                  paperLink = result;
                  console.log(`策略 ${i + 1} 成功找到论文链接: ${paperLink}`);
                  break;
                }
              } catch (error) {
                console.warn(`策略 ${i + 1} 执行失败:`, error);
              }
            }

            if (title && detailUrl) {
              const result: any = {
                title: title,
                authors: authors,
                detailUrl: detailUrl,
              };

              if (paperLink) {
                result.paperLink = paperLink;
              }

              results.push(result);
            }
          } catch (error) {
            console.warn('提取搜索结果项时出错:', error);
          }
        });

        return results;
      }, selectors);

      logger.info(`传统方式提取到 ${conventionalResults.length} 个搜索结果`);
    }

    // 传统方式专用模式，直接返回
    if (browserUseMode === 'traditional-only') {
      return conventionalResults;
    }

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
          paperLink: result.paperLink || existing.paperLink, // 优先使用有paperLink的版本
          abstract: result.abstract || existing.abstract,
        };
        titleMap.set(titleKey, mergedResult);

        // 记录合并信息
        if (result.paperLink && !existing.paperLink) {
          logger.info(`合并结果: ${result.title} - Browser-Use提供了论文链接`);
        } else if (!result.paperLink && existing.paperLink) {
          logger.info(`合并结果: ${result.title} - 传统方式提供了论文链接`);
        }
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

      // 优先使用搜索结果中的论文链接，如果没有再使用详情页面提取的链接
      const paperLink = searchResult.paperLink
        ? searchResult.paperLink
        : getAbsoluteUrl(searchResult.detailUrl, paperDetail.paperLink);

      // 创建基础论文信息，优先使用详情页面的信息，但如果缺失则使用搜索结果中的信息
      let paperInfo: PaperInfo = {
        title,
        authors,
        abstract: abstract || (searchResult as any).abstract || '', // 使用搜索结果中的摘要作为后备
        paperLink,
        searchKeyword: keyword,
        crawledAt: new Date(),
      };

      // 记录使用的论文链接来源
      if (searchResult.paperLink) {
        logger.info(`使用搜索结果中的论文链接: ${searchResult.paperLink}`);
      } else if (paperDetail.paperLink) {
        logger.info(`使用详情页面的论文链接: ${paperLink}`);
      } else {
        logger.warn('未找到论文链接');
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
