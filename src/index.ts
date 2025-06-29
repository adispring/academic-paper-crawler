#!/usr/bin/env node

import { Command } from 'commander';
import { AcademicPaperCrawler } from './crawler';
import { CrawlerConfig } from './types';
import { logger } from './utils';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 主程序类
 */
class PaperCrawlerApp {
  private program: Command;

  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  /**
   * 设置命令行参数
   */
  private setupCommands(): void {
    this.program
      .name('academic-paper-crawler')
      .description('学术论文爬虫工具 - 自动爬取SIGCHI会议论文信息')
      .version('1.0.0');

    this.program
      .command('search')
      .description('搜索并爬取论文信息')
      .requiredOption('-k, --keyword <keyword>', '搜索关键词')
      .option('-o, --output <path>', '输出目录路径', './output')
      .option('-f, --format <format>', '输出格式 (csv|json)', 'csv')
      .option('--headless <headless>', '是否使用无头模式', 'true')
      .option('--timeout <timeout>', '超时时间(毫秒)', '60000')
      .option('--max-retries <retries>', '最大重试次数', '3')
      .option('--retry-delay <delay>', '重试延迟(毫秒)', '2000')
      .action(async (options) => {
        await this.handleSearchCommand(options);
      });

    this.program
      .command('batch')
      .description('批量搜索多个关键词')
      .requiredOption('-f, --file <file>', '包含关键词的文件路径 (每行一个关键词)')
      .option('-o, --output <path>', '输出目录路径', './output')
      .option('--format <format>', '输出格式 (csv|json)', 'csv')
      .option('--headless <headless>', '是否使用无头模式', 'true')
      .option('--delay <delay>', '批次间延迟(毫秒)', '5000')
      .action(async (options) => {
        await this.handleBatchCommand(options);
      });
  }

  /**
   * 处理搜索命令
   */
  private async handleSearchCommand(options: any): Promise<void> {
    try {
      logger.info('=== 学术论文爬虫开始运行 ===');
      logger.info(`搜索关键词: ${options.keyword}`);
      
      const config: Partial<CrawlerConfig> = {
        outputPath: path.resolve(options.output),
        outputFormat: options.format,
        headless: this.parseBoolean(options.headless),
        timeout: parseInt(options.timeout),
        maxRetries: parseInt(options.maxRetries),
        retryDelay: parseInt(options.retryDelay)
      };

      const crawler = new AcademicPaperCrawler(config);

      try {
        const papers = await crawler.searchPapers(options.keyword);
        
        if (papers.length === 0) {
          logger.warn('未找到任何论文信息');
          return;
        }

        const outputFile = await crawler.saveResults(papers, options.keyword);
        
        const status = crawler.getStatus();
        this.displayStatistics(status, outputFile);

      } finally {
        await crawler.close();
      }

    } catch (error) {
      logger.error(`爬虫运行失败: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * 处理批量搜索命令
   */
  private async handleBatchCommand(options: any): Promise<void> {
    try {
      logger.info('=== 批量搜索模式 ===');
      
      const keywords = fs.readFileSync(options.file, 'utf8')
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);

      if (keywords.length === 0) {
        throw new Error('关键词文件为空或格式不正确');
      }

      logger.info(`找到 ${keywords.length} 个关键词`);

      const config: Partial<CrawlerConfig> = {
        outputPath: path.resolve(options.output),
        outputFormat: options.format,
        headless: this.parseBoolean(options.headless)
      };

      const crawler = new AcademicPaperCrawler(config);
      const delay = parseInt(options.delay);
      let totalPapers = 0;

      try {
        for (let i = 0; i < keywords.length; i++) {
          const keyword = keywords[i];
          logger.info(`\n[${i + 1}/${keywords.length}] 搜索关键词: ${keyword}`);

          try {
            const papers = await crawler.searchPapers(keyword);
            
            if (papers.length > 0) {
              await crawler.saveResults(papers, keyword);
              totalPapers += papers.length;
              
              const status = crawler.getStatus();
              logger.info(`关键词 "${keyword}" 完成: 找到 ${papers.length} 篇论文`);
            } else {
              logger.warn(`关键词 "${keyword}" 未找到任何论文`);
            }

          } catch (error) {
            logger.error(`处理关键词 "${keyword}" 时出错: ${(error as Error).message}`);
          }

          if (i < keywords.length - 1) {
            logger.info(`等待 ${delay}ms 后处理下一个关键词...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        logger.info(`\n=== 批量搜索完成 ===`);
        logger.info(`总共处理了 ${keywords.length} 个关键词`);
        logger.info(`总共找到了 ${totalPapers} 篇论文`);

      } finally {
        await crawler.close();
      }

    } catch (error) {
      logger.error(`批量搜索失败: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * 显示统计信息
   */
  private displayStatistics(status: any, outputFile: string): void {
    console.log('\n=== 爬取统计 ===');
    console.log(`搜索关键词: ${status.keyword}`);
    console.log(`找到结果: ${status.totalFound} 个`);
    console.log(`处理完成: ${status.processed} 个`);
    console.log(`成功提取: ${status.successful} 个`);
    console.log(`失败数量: ${status.failed} 个`);
    
    if (status.errors.length > 0) {
      console.log('\n=== 错误信息 ===');
      status.errors.forEach((error: string, index: number) => {
        console.log(`${index + 1}. ${error}`);
      });
    }

    console.log(`\n结果已保存到: ${outputFile}`);
  }

  /**
   * 解析布尔值
   */
  private parseBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return true;
  }

  /**
   * 运行程序
   */
  async run(): Promise<void> {
    await this.program.parseAsync(process.argv);
  }
}

// 运行主程序
if (require.main === module) {
  const app = new PaperCrawlerApp();
  app.run().catch((error) => {
    logger.error('程序运行出错:', error);
    process.exit(1);
  });
}

export { PaperCrawlerApp };
