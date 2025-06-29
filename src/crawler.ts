import puppeteer, { Browser, Page } from 'puppeteer';
import * as createCsvWriter from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';
import { PaperInfo, CrawlerConfig, SearchResultItem, CrawlerStatus } from './types';
import { defaultCrawlerConfig, selectors, delays } from './config';
import { logger, sleep, cleanText, parseAuthors, getAbsoluteUrl, setupOutputDirectory } from './utils';

/**
 * 学术论文爬虫类
 */
export class AcademicPaperCrawler {
  private browser: Browser | null = null;
  private config: CrawlerConfig;
  private status: CrawlerStatus;

  constructor(config: Partial<CrawlerConfig> = {}) {
    this.config = { ...defaultCrawlerConfig, ...config };
    this.status = {
      keyword: '',
      totalFound: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };
    
    setupOutputDirectory(this.config.outputPath);
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
        '--window-size=1920,1080'
      ]
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
      const searchUrl = `${this.config.baseUrl}?searchKey=${encodeURIComponent(keyword)}`;
      logger.info(`访问搜索页面: ${searchUrl}`);

      await page.goto(searchUrl, { waitUntil: 'networkidle2' });
      await sleep(delays.pageLoad);

      const searchResults = await this.extractSearchResults(page);
      this.status.totalFound = searchResults.length;
      
      logger.info(`找到 ${searchResults.length} 个搜索结果`);

      for (let i = 0; i < searchResults.length; i++) {
        const result = searchResults[i];
        this.status.processed = i + 1;
        
        logger.info(`处理第 ${i + 1}/${searchResults.length} 个结果: ${result.title}`);

        try {
          const paperInfo = await this.extractPaperDetail(result, keyword);
          if (paperInfo) {
            papers.push(paperInfo);
            this.status.successful++;
            logger.info(`成功提取论文信息: ${paperInfo.title}`);
          }
        } catch (error) {
          this.status.failed++;
          const errorMsg = `提取论文详情失败: ${result.title} - ${(error as Error).message}`;
          this.status.errors.push(errorMsg);
          logger.error(errorMsg);
        }

        if (i < searchResults.length - 1) {
          await sleep(delays.betweenRequests);
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

    logger.info(`搜索完成。成功: ${this.status.successful}, 失败: ${this.status.failed}`);
    return papers;
  }

  /**
   * 从搜索页面提取结果列表
   */
  private async extractSearchResults(page: Page): Promise<SearchResultItem[]> {
    return await page.evaluate((selectors) => {
      const results: SearchResultItem[] = [];
      const resultElements = document.querySelectorAll(selectors.searchResults);
      
      resultElements.forEach((element) => {
        try {
          const titleElement = element.querySelector(selectors.paperTitle);
          const title = titleElement?.textContent?.trim() || '';
          
          const authorsElement = element.querySelector(selectors.paperAuthors);
          const authorsText = authorsElement?.textContent?.trim() || '';
          const authors = authorsText ? authorsText.split(/[,;]/).map(a => a.trim()) : [];
          
          const linkElement = element.querySelector(selectors.detailLink) as HTMLAnchorElement;
          const detailUrl = linkElement?.href || '';
          
          if (title && detailUrl) {
            results.push({
              title: title,
              authors: authors,
              detailUrl: detailUrl
            });
          }
        } catch (error) {
          console.warn('提取搜索结果项时出错:', error);
        }
      });
      
      return results;
    }, selectors);
  }

  /**
   * 提取论文详细信息
   */
  private async extractPaperDetail(searchResult: SearchResultItem, keyword: string): Promise<PaperInfo | null> {
    const detailPage = await this.createPage();
    
    try {
      logger.info(`访问详情页面: ${searchResult.detailUrl}`);
      await detailPage.goto(searchResult.detailUrl, { waitUntil: 'networkidle2' });
      await sleep(delays.pageLoad);

      const paperDetail = await detailPage.evaluate((selectors) => {
        const titleElement = document.querySelector(selectors.detailTitle);
        const title = titleElement?.textContent?.trim() || '';
        
        const authorsElement = document.querySelector(selectors.detailAuthors);
        const authorsText = authorsElement?.textContent?.trim() || '';
        
        const abstractElement = document.querySelector(selectors.detailAbstract);
        const abstract = abstractElement?.textContent?.trim() || '';
        
        const paperLinkElement = document.querySelector(selectors.detailPaperLink) as HTMLAnchorElement;
        const paperLink = paperLinkElement?.href || '';
        
        return {
          title,
          authorsText,
          abstract,
          paperLink
        };
      }, selectors);

      const title = cleanText(paperDetail.title || searchResult.title);
      const authors = parseAuthors(paperDetail.authorsText) || searchResult.authors;
      const abstract = cleanText(paperDetail.abstract);
      const paperLink = getAbsoluteUrl(searchResult.detailUrl, paperDetail.paperLink);

      if (!title) {
        throw new Error('无法提取论文标题');
      }

      return {
        title,
        authors,
        abstract,
        paperLink,
        searchKeyword: keyword,
        crawledAt: new Date()
      };

    } catch (error) {
      logger.error(`提取论文详情失败: ${searchResult.detailUrl} - ${(error as Error).message}`);
      throw error;
    } finally {
      await detailPage.close();
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
  private async saveToCsv(papers: PaperInfo[], filename: string): Promise<string> {
    const csvPath = path.join(this.config.outputPath, `${filename}.csv`);
    
    const csvWriter = createCsvWriter.createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'title', title: '论文标题' },
        { id: 'authors', title: '作者' },
        { id: 'abstract', title: '摘要' },
        { id: 'paperLink', title: '论文链接' },
        { id: 'searchKeyword', title: '搜索关键词' },
        { id: 'crawledAt', title: '抓取时间' }
      ],
      encoding: 'utf8'
    });

    const csvData = papers.map(paper => ({
      ...paper,
      authors: paper.authors.join('; '),
      crawledAt: paper.crawledAt.toISOString()
    }));

    await csvWriter.writeRecords(csvData);
    logger.info(`结果已保存到CSV文件: ${csvPath}`);
    
    return csvPath;
  }

  /**
   * 保存为JSON格式
   */
  private async saveToJson(papers: PaperInfo[], filename: string): Promise<string> {
    const jsonPath = path.join(this.config.outputPath, `${filename}.json`);
    
    const jsonData = {
      searchKeyword: this.status.keyword,
      crawledAt: new Date().toISOString(),
      totalCount: papers.length,
      papers: papers
    };

    await fs.promises.writeFile(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
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
