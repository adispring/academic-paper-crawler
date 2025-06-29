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
          const paperInfo = await this.extractPaperDetail(result, keyword);
          if (paperInfo) {
            papers.push(paperInfo);
            this.status.successful++;
            logger.info(`成功提取论文信息: ${paperInfo.title}`);
          }
        } catch (error) {
          this.status.failed++;
          const errorMsg = `提取论文详情失败: ${result.title} - ${
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
      if (this.aiAnalyzer && papers.length > 0) {
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

    if (browserUseMode !== 'browser-use-only') {
      // 首先尝试常规CSS选择器提取
      conventionalResults = await page.evaluate((selectors) => {
        const results: SearchResultItem[] = [];
        const resultElements = document.querySelectorAll(
          selectors.searchResults
        );

        resultElements.forEach((element) => {
          try {
            const titleElement = element.querySelector(selectors.paperTitle);
            const title = titleElement?.textContent?.trim() || '';

            const authorsElement = element.querySelector(
              selectors.paperAuthors
            );
            const authorsText = authorsElement?.textContent?.trim() || '';
            const authors = authorsText
              ? authorsText.split(/[,;]/).map((a) => a.trim())
              : [];

            const linkElement = element.querySelector(
              selectors.detailLink
            ) as HTMLAnchorElement;
            const detailUrl = linkElement?.href || '';

            // 尝试提取论文链接（标题上方或旁边的链接符号）
            let paperLink = '';
            const paperLinkSelectors = [
              'a[href*="pdf"]',
              'a[href*="doi"]',
              'a[href*="paper"]',
              'a[title*="pdf"]',
              'a[title*="paper"]',
              'a[title*="download"]',
              'a[class*="paper"]',
              'a[class*="pdf"]',
              'a[class*="link"]',
            ];

            for (const selector of paperLinkSelectors) {
              const paperLinkElement = element.querySelector(
                selector
              ) as HTMLAnchorElement;
              if (
                paperLinkElement &&
                paperLinkElement.href &&
                paperLinkElement.href !== detailUrl
              ) {
                paperLink = paperLinkElement.href;
                break;
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
