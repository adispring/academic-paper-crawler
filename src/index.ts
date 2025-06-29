#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { Command } from 'commander';

// 加载环境变量
dotenv.config();
import { AcademicPaperCrawler } from './crawler';
import { CrawlerConfig, ScrollConfig, AIAnalysisType } from './types';
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
      .option('--ai', '启用AI分析功能')
      .option('--ai-extract', '启用AI辅助信息提取（提高提取准确性）')
      .option('--ai-extract-fallback', '仅在常规提取失败时使用AI辅助提取')
      .option('--ai-extract-enhance', '使用AI增强所有提取结果的质量')
      .option('--enable-detail-extraction', '启用详情页提取（默认开启）')
      .option(
        '--disable-detail-extraction',
        '禁用详情页提取，仅使用搜索结果信息（快速模式）'
      )
      .option('--browser-use', '启用Browser-Use智能浏览器操作')
      .option(
        '--browser-use-mode <mode>',
        'Browser-Use模式: hybrid(混合), browser-use-only(仅Browser-Use), traditional-only(仅传统)',
        'hybrid'
      )
      .option('--ai-model <model>', 'AI模型名称', 'gpt-4o-mini')
      .option(
        '--ai-api-key <key>',
        'OpenAI API密钥 (或设置 OPENAI_API_KEY 环境变量)'
      )
      .option('--ai-temperature <temp>', 'AI温度设置', '0.3')
      .option('--ai-max-tokens <tokens>', 'AI最大令牌数', '1000')
      .option('--translate', '启用摘要翻译功能（非中文摘要翻译为中文）')
      .option(
        '--translate-mode <mode>',
        '翻译模式：always(总是翻译), non-chinese-only(仅翻译非中文), disabled(禁用)',
        'non-chinese-only'
      )
      .option('--no-scroll', '禁用滚动加载功能（仅获取首屏结果）')
      .option('--max-scrolls <count>', '最大滚动次数', '100')
      .option('--scroll-delay <ms>', '滚动延迟时间(毫秒)', '2000')
      .option('--no-human-scroll', '禁用人类式滚动，使用传统快速滚动')
      .option(
        '--scroll-steps <min-max>',
        '滚动步数范围，格式: min-max (如: 3-6)',
        '3-6'
      )
      .option(
        '--step-delay <min-max>',
        '步骤延迟范围(毫秒)，格式: min-max (如: 800-1800)',
        '800-1800'
      )
      .option('--backscroll-chance <probability>', '回看概率 (0-1)', '0.3')
      // 虚拟列表优化选项
      .option('--no-virtual-list-optimization', '禁用虚拟列表优化')
      .option('--virtual-list-delay <ms>', '虚拟列表滚动延迟(毫秒)', '3500')
      .option('--virtual-list-max-retries <count>', '虚拟列表最大重试次数', '6')
      .option(
        '--virtual-list-threshold <threshold>',
        '虚拟列表收集完成阈值 (0-1)',
        '0.85'
      )
      .action(async (options) => {
        await this.handleSearchCommand(options);
      });

    this.program
      .command('batch')
      .description('批量搜索多个关键词')
      .requiredOption(
        '-f, --file <file>',
        '包含关键词的文件路径 (每行一个关键词)'
      )
      .option('-o, --output <path>', '输出目录路径', './output')
      .option('--format <format>', '输出格式 (csv|json)', 'csv')
      .option('--headless <headless>', '是否使用无头模式', 'true')
      .option('--delay <delay>', '批次间延迟(毫秒)', '5000')
      .option('--ai', '启用AI分析功能')
      .option('--ai-extract', '启用AI辅助信息提取（提高提取准确性）')
      .option('--ai-extract-fallback', '仅在常规提取失败时使用AI辅助提取')
      .option('--ai-extract-enhance', '使用AI增强所有提取结果的质量')
      .option('--enable-detail-extraction', '启用详情页提取（默认开启）')
      .option(
        '--disable-detail-extraction',
        '禁用详情页提取，仅使用搜索结果信息（快速模式）'
      )
      .option('--browser-use', '启用Browser-Use智能浏览器操作')
      .option(
        '--browser-use-mode <mode>',
        'Browser-Use模式: hybrid(混合), browser-use-only(仅Browser-Use), traditional-only(仅传统)',
        'hybrid'
      )
      .option('--ai-model <model>', 'AI模型名称', 'gpt-4o-mini')
      .option(
        '--ai-api-key <key>',
        'OpenAI API密钥 (或设置 OPENAI_API_KEY 环境变量)'
      )
      .option('--ai-temperature <temp>', 'AI温度设置', '0.3')
      .option('--ai-max-tokens <tokens>', 'AI最大令牌数', '1000')
      .option('--translate', '启用摘要翻译功能（非中文摘要翻译为中文）')
      .option(
        '--translate-mode <mode>',
        '翻译模式：always(总是翻译), non-chinese-only(仅翻译非中文), disabled(禁用)',
        'non-chinese-only'
      )
      .option('--no-scroll', '禁用滚动加载功能（仅获取首屏结果）')
      .option('--max-scrolls <count>', '最大滚动次数', '100')
      .option('--scroll-delay <ms>', '滚动延迟时间(毫秒)', '2000')
      .option('--no-human-scroll', '禁用人类式滚动，使用传统快速滚动')
      .option(
        '--scroll-steps <min-max>',
        '滚动步数范围，格式: min-max (如: 3-6)',
        '3-6'
      )
      .option(
        '--step-delay <min-max>',
        '步骤延迟范围(毫秒)，格式: min-max (如: 800-1800)',
        '800-1800'
      )
      .option('--backscroll-chance <probability>', '回看概率 (0-1)', '0.3')
      // 虚拟列表优化选项
      .option('--no-virtual-list-optimization', '禁用虚拟列表优化')
      .option('--virtual-list-delay <ms>', '虚拟列表滚动延迟(毫秒)', '3500')
      .option('--virtual-list-max-retries <count>', '虚拟列表最大重试次数', '6')
      .option(
        '--virtual-list-threshold <threshold>',
        '虚拟列表收集完成阈值 (0-1)',
        '0.85'
      )
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
        retryDelay: parseInt(options.retryDelay),
        // 滚动配置
        scrollConfig: this.parseScrollConfig(options),
      };

      // 配置AI选项（默认禁用AI论文分析功能）
      if (
        options.aiExtract ||
        options.aiExtractFallback ||
        options.aiExtractEnhance ||
        options.browserUse ||
        options.translate
      ) {
        config.aiConfig = {
          enabled: true,
          model: options.aiModel || process.env.AI_MODEL || 'gpt-4o-mini',
          apiKey: options.aiApiKey || process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL,
          temperature: parseFloat(
            options.aiTemperature || process.env.AI_TEMPERATURE || '0.3'
          ),
          maxTokens: parseInt(
            options.aiMaxTokens || process.env.AI_MAX_TOKENS || '1000'
          ),
          analysisTypes: [
            'summarize' as any,
            'extract_keywords' as any,
            'relevance' as any,
          ],
          // AI论文分析配置（默认禁用）
          enableAnalysis: false, // 强制禁用AI论文分析
          // AI辅助提取配置
          enableExtraction:
            options.aiExtract ||
            options.aiExtractFallback ||
            options.aiExtractEnhance ||
            options.browserUse,
          extractionMode: options.aiExtractEnhance
            ? 'enhance'
            : options.aiExtractFallback
            ? 'fallback'
            : 'always',
          // 详情页提取配置
          enableDetailExtraction: options.disableDetailExtraction
            ? false
            : options.enableDetailExtraction !== false,
          // Browser-Use 配置
          useBrowserUse: options.browserUse || false,
          browserUseMode: options.browserUseMode || 'hybrid',
          // 翻译配置
          enableTranslation: options.translate || false,
          translationMode: options.translateMode || 'non-chinese-only',
        };

        logger.info('AI 功能已启用');
        logger.info(`使用模型: ${config.aiConfig.model}`);

        // AI分析功能（默认禁用）
        if (options.ai) {
          logger.warn('⚠ AI论文分析功能已被禁用（如需启用请联系开发者）');
        }

        // AI辅助提取功能
        if (config.aiConfig.enableExtraction) {
          logger.info('✓ AI辅助信息提取功能已启用');
          const modeDesc = {
            always: '总是使用AI提取',
            fallback: '仅在常规提取失败时使用AI',
            enhance: '使用AI增强提取结果',
          };
          logger.info(
            `提取模式: ${modeDesc[config.aiConfig.extractionMode || 'always']}`
          );
        }

        // Browser-Use 功能
        if (options.browserUse) {
          logger.info('✓ Browser-Use 智能浏览器操作已启用');
          logger.info(
            `Browser-Use 模式: ${options.browserUseMode || 'hybrid'}`
          );
        }

        if (options.aiApiKey) {
          logger.info(`使用命令行提供的 API 密钥`);
        } else if (process.env.OPENAI_API_KEY) {
          logger.info(`使用环境变量中的 API 密钥`);
        } else {
          logger.warn('未设置 OpenAI API 密钥，AI 功能可能无法正常工作');
          logger.info('请设置 OPENAI_API_KEY 环境变量或使用 --ai-api-key 参数');
        }

        if (process.env.OPENAI_BASE_URL) {
          logger.info(
            `使用自定义 API 基础 URL: ${process.env.OPENAI_BASE_URL}`
          );
        }

        // 翻译功能
        if (options.translate) {
          logger.info('✓ 摘要翻译功能已启用');
          const modeDesc = {
            always: '总是翻译',
            'non-chinese-only': '仅翻译非中文内容',
            disabled: '禁用翻译',
          };
          logger.info(
            `翻译模式: ${
              modeDesc[options.translateMode as keyof typeof modeDesc] ||
              '仅翻译非中文内容'
            }`
          );
        }

        // 详情页提取功能状态
        if (config.aiConfig.enableDetailExtraction) {
          logger.info('✓ 详情页提取已启用 (完整模式)');
          logger.info('  将访问每个论文详情页获取完整摘要和精确链接');
        } else {
          logger.info('⚡ 详情页提取已禁用 (快速模式)');
          logger.info('  仅使用搜索结果信息，速度提升5-10倍');
        }
      }

      // 显示滚动配置状态
      if (config.scrollConfig?.enabled) {
        logger.info('✓ 分页滚动加载已启用');
        logger.info(`最大滚动次数: ${config.scrollConfig.maxScrolls}`);
        logger.info(`滚动延迟: ${config.scrollConfig.scrollDelay}ms`);

        // 显示虚拟列表优化状态
        if (config.scrollConfig.virtualListOptimization) {
          logger.info('✓ 虚拟列表优化已启用');
          logger.info(
            `虚拟列表滚动延迟: ${config.scrollConfig.virtualListScrollDelay}ms`
          );
          logger.info(
            `虚拟列表最大重试: ${config.scrollConfig.virtualListMaxRetries}次`
          );
          logger.info(
            `虚拟列表收集阈值: ${Math.round(
              config.scrollConfig.virtualListCollectionThreshold * 100
            )}%`
          );
        } else {
          logger.info('⚠ 虚拟列表优化已禁用');
        }
      } else {
        logger.info('⚠ 分页滚动加载已禁用（仅获取首屏结果）');
      }

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

      const keywords = fs
        .readFileSync(options.file, 'utf8')
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
        headless: this.parseBoolean(options.headless),
        // 滚动配置
        scrollConfig: this.parseScrollConfig(options),
      };

      // 配置AI选项（与search命令相同，默认禁用AI论文分析功能）
      if (
        options.aiExtract ||
        options.aiExtractFallback ||
        options.aiExtractEnhance ||
        options.browserUse ||
        options.translate
      ) {
        config.aiConfig = {
          enabled: true,
          model: options.aiModel || process.env.AI_MODEL || 'gpt-4o-mini',
          apiKey: options.aiApiKey || process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL,
          temperature: parseFloat(
            options.aiTemperature || process.env.AI_TEMPERATURE || '0.3'
          ),
          maxTokens: parseInt(
            options.aiMaxTokens || process.env.AI_MAX_TOKENS || '1000'
          ),
          analysisTypes: [
            'summarize' as any,
            'extract_keywords' as any,
            'relevance' as any,
          ],
          // AI论文分析配置（默认禁用）
          enableAnalysis: false, // 强制禁用AI论文分析
          // AI辅助提取配置
          enableExtraction:
            options.aiExtract ||
            options.aiExtractFallback ||
            options.aiExtractEnhance ||
            options.browserUse,
          extractionMode: options.aiExtractEnhance
            ? 'enhance'
            : options.aiExtractFallback
            ? 'fallback'
            : 'always',
          // 详情页提取配置
          enableDetailExtraction: options.disableDetailExtraction
            ? false
            : options.enableDetailExtraction !== false,
          // Browser-Use 配置
          useBrowserUse: options.browserUse || false,
          browserUseMode: options.browserUseMode || 'hybrid',
          // 翻译配置
          enableTranslation: options.translate || false,
          translationMode: options.translateMode || 'non-chinese-only',
        };

        logger.info('批量搜索 AI 功能已启用');
        logger.info(`使用模型: ${config.aiConfig.model}`);

        // AI分析功能（默认禁用）
        if (options.ai) {
          logger.warn('⚠ AI论文分析功能已被禁用（如需启用请联系开发者）');
        }

        // AI辅助提取功能
        if (config.aiConfig.enableExtraction) {
          logger.info('✓ AI辅助信息提取功能已启用');
          const modeDesc = {
            always: '总是使用AI提取',
            fallback: '仅在常规提取失败时使用AI',
            enhance: '使用AI增强提取结果',
          };
          logger.info(
            `提取模式: ${modeDesc[config.aiConfig.extractionMode || 'always']}`
          );
        }

        // Browser-Use 功能
        if (options.browserUse) {
          logger.info('✓ Browser-Use 智能浏览器操作已启用');
          logger.info(
            `Browser-Use 模式: ${options.browserUseMode || 'hybrid'}`
          );
        }

        // 翻译功能
        if (options.translate) {
          logger.info('✓ 摘要翻译功能已启用');
          const modeDesc = {
            always: '总是翻译',
            'non-chinese-only': '仅翻译非中文内容',
            disabled: '禁用翻译',
          };
          logger.info(
            `翻译模式: ${
              modeDesc[options.translateMode as keyof typeof modeDesc] ||
              '仅翻译非中文内容'
            }`
          );
        }

        if (options.aiApiKey) {
          logger.info(`使用命令行提供的 API 密钥`);
        } else if (process.env.OPENAI_API_KEY) {
          logger.info(`使用环境变量中的 API 密钥`);
        } else {
          logger.warn('未设置 OpenAI API 密钥，AI 功能可能无法正常工作');
          logger.info('请设置 OPENAI_API_KEY 环境变量或使用 --ai-api-key 参数');
        }

        if (process.env.OPENAI_BASE_URL) {
          logger.info(
            `使用自定义 API 基础 URL: ${process.env.OPENAI_BASE_URL}`
          );
        }

        // 详情页提取功能状态
        if (config.aiConfig.enableDetailExtraction) {
          logger.info('✓ 详情页提取已启用 (完整模式)');
          logger.info('  将访问每个论文详情页获取完整摘要和精确链接');
        } else {
          logger.info('⚡ 详情页提取已禁用 (快速模式)');
          logger.info('  仅使用搜索结果信息，速度提升5-10倍');
        }
      }

      // 显示滚动配置状态
      if (config.scrollConfig?.enabled) {
        logger.info('✓ 分页滚动加载已启用');
        logger.info(`最大滚动次数: ${config.scrollConfig.maxScrolls}`);
        logger.info(`滚动延迟: ${config.scrollConfig.scrollDelay}ms`);

        // 显示虚拟列表优化状态
        if (config.scrollConfig.virtualListOptimization) {
          logger.info('✓ 虚拟列表优化已启用');
          logger.info(
            `虚拟列表滚动延迟: ${config.scrollConfig.virtualListScrollDelay}ms`
          );
          logger.info(
            `虚拟列表最大重试: ${config.scrollConfig.virtualListMaxRetries}次`
          );
          logger.info(
            `虚拟列表收集阈值: ${Math.round(
              config.scrollConfig.virtualListCollectionThreshold * 100
            )}%`
          );
        } else {
          logger.info('⚠ 虚拟列表优化已禁用');
        }
      } else {
        logger.info('⚠ 分页滚动加载已禁用（仅获取首屏结果）');
      }

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
              logger.info(
                `关键词 "${keyword}" 完成: 找到 ${papers.length} 篇论文`
              );
            } else {
              logger.warn(`关键词 "${keyword}" 未找到任何论文`);
            }
          } catch (error) {
            logger.error(
              `处理关键词 "${keyword}" 时出错: ${(error as Error).message}`
            );
          }

          if (i < keywords.length - 1) {
            logger.info(`等待 ${delay}ms 后处理下一个关键词...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
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
   * 解析滚动配置
   */
  private parseScrollConfig(options: any): ScrollConfig {
    // 解析步数范围
    const parseRange = (
      rangeStr: string,
      defaultMin: number,
      defaultMax: number
    ) => {
      const parts = rangeStr.split('-').map((s) => parseInt(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return { min: parts[0], max: parts[1] };
      }
      return { min: defaultMin, max: defaultMax };
    };

    const scrollSteps = parseRange(options.scrollSteps || '3-6', 3, 6);
    const stepDelay = parseRange(options.stepDelay || '800-1800', 800, 1800);

    return {
      enabled: !options.noScroll,
      maxScrolls: parseInt(options.maxScrolls || '100'),
      maxRetries: 3,
      scrollDelay: parseInt(options.scrollDelay || '2000'),
      detectLoadMore: true,
      // 人类式滚动配置
      humanLike: !options.noHumanScroll, // --no-human-scroll 选项
      scrollStepsMin: scrollSteps.min,
      scrollStepsMax: scrollSteps.max,
      stepDelayMin: stepDelay.min,
      stepDelayMax: stepDelay.max,
      randomBackscroll: true, // 默认启用
      backscrollChance: parseFloat(options.backscrollChance || '0.3'),
      // 虚拟列表优化配置
      virtualListOptimization: !options.noVirtualListOptimization, // --no-virtual-list-optimization 选项
      virtualListScrollDelay: parseInt(options.virtualListDelay || '3500'),
      virtualListMaxRetries: parseInt(options.virtualListMaxRetries || '6'),
      virtualListCollectionThreshold: parseFloat(
        options.virtualListThreshold || '0.85'
      ),
    };
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
