import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import {
  PaperInfo,
  AIConfig,
  AIAnalysisResult,
  AIAnalysisType,
} from '../types';
import { aiPrompts } from '../config';
import { logger } from '../utils';

/**
 * AI 论文分析处理器
 */
export class PaperAnalyzer {
  private llm: ChatOpenAI;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;

    // 初始化 OpenAI 模型
    this.llm = new ChatOpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      modelName: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      ...(config.baseURL && {
        openAIApiKey: config.apiKey || process.env.OPENAI_API_KEY,
        configuration: {
          baseURL: config.baseURL,
        },
      }),
    });
  }

  /**
   * 执行带重试的AI调用
   */
  private async invokeWithRetry(
    prompt: string,
    maxRetries: number = 3
  ): Promise<string> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const message = new HumanMessage(prompt);
        const response = await this.llm.invoke([message]);
        return response.content.toString().trim();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw lastError;
        }

        logger.warn(
          `AI 调用失败，重试第 ${attempt + 1} 次: ${lastError.message}`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
      }
    }

    throw lastError!;
  }

  /**
   * 总结分析
   */
  private async summarizeAnalysis(
    paperInfo: PaperInfo
  ): Promise<Partial<AIAnalysisResult>> {
    try {
      const prompt = aiPrompts.summarize
        .replace('{title}', paperInfo.title)
        .replace('{authors}', paperInfo.authors.join(', '))
        .replace('{abstract}', paperInfo.abstract);

      const summary = await this.invokeWithRetry(prompt);

      return { summary };
    } catch (error) {
      logger.error('总结分析失败:', error);
      return {};
    }
  }

  /**
   * 分类分析
   */
  private async classifyAnalysis(
    paperInfo: PaperInfo
  ): Promise<Partial<AIAnalysisResult>> {
    try {
      const prompt = aiPrompts.classify
        .replace('{title}', paperInfo.title)
        .replace('{abstract}', paperInfo.abstract);

      const classification = await this.invokeWithRetry(prompt);

      return { classification };
    } catch (error) {
      logger.error('分类分析失败:', error);
      return {};
    }
  }

  /**
   * 关键词提取
   */
  private async extractKeywordsAnalysis(
    paperInfo: PaperInfo
  ): Promise<Partial<AIAnalysisResult>> {
    try {
      const prompt = aiPrompts.extractKeywords
        .replace('{title}', paperInfo.title)
        .replace('{abstract}', paperInfo.abstract);

      const keywordsText = await this.invokeWithRetry(prompt);
      const keywords = keywordsText
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      return { keywords };
    } catch (error) {
      logger.error('关键词提取失败:', error);
      return {};
    }
  }

  /**
   * 情感分析
   */
  private async sentimentAnalysis(
    paperInfo: PaperInfo
  ): Promise<Partial<AIAnalysisResult>> {
    try {
      const prompt = aiPrompts.sentiment.replace(
        '{abstract}',
        paperInfo.abstract
      );

      const sentimentText = await this.invokeWithRetry(prompt);
      const sentimentLower = sentimentText.toLowerCase();

      let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (
        sentimentLower.includes('积极') ||
        sentimentLower.includes('positive')
      ) {
        sentiment = 'positive';
      } else if (
        sentimentLower.includes('消极') ||
        sentimentLower.includes('negative')
      ) {
        sentiment = 'negative';
      }

      return { sentiment };
    } catch (error) {
      logger.error('情感分析失败:', error);
      return {};
    }
  }

  /**
   * 相关性分析
   */
  private async relevanceAnalysis(
    paperInfo: PaperInfo
  ): Promise<Partial<AIAnalysisResult>> {
    try {
      const prompt = aiPrompts.relevance
        .replace('{keyword}', paperInfo.searchKeyword)
        .replace('{title}', paperInfo.title)
        .replace('{abstract}', paperInfo.abstract);

      const relevanceText = await this.invokeWithRetry(prompt);
      const relevanceScore = parseFloat(
        relevanceText.match(/\d+(\.\d+)?/)?.[0] || '0'
      );

      return {
        relevanceScore: Math.max(0, Math.min(10, relevanceScore)),
      };
    } catch (error) {
      logger.error('相关性分析失败:', error);
      return {};
    }
  }

  /**
   * 分析单个论文
   */
  async analyzePaper(
    paperInfo: PaperInfo,
    analysisType: AIAnalysisType
  ): Promise<AIAnalysisResult | null> {
    if (!this.config.enabled) {
      logger.info('AI 分析已禁用');
      return null;
    }

    try {
      logger.info(`开始 AI 分析: ${analysisType} - ${paperInfo.title}`);

      let result: Partial<AIAnalysisResult> = {};

      switch (analysisType) {
        case AIAnalysisType.SUMMARIZE:
          result = await this.summarizeAnalysis(paperInfo);
          break;
        case AIAnalysisType.CLASSIFY:
          result = await this.classifyAnalysis(paperInfo);
          break;
        case AIAnalysisType.EXTRACT_KEYWORDS:
          result = await this.extractKeywordsAnalysis(paperInfo);
          break;
        case AIAnalysisType.SENTIMENT:
          result = await this.sentimentAnalysis(paperInfo);
          break;
        case AIAnalysisType.RELEVANCE:
          result = await this.relevanceAnalysis(paperInfo);
          break;
        default:
          logger.warn(`不支持的分析类型: ${analysisType}`);
          return null;
      }

      const analysisResult: AIAnalysisResult = {
        ...result,
        processedAt: new Date(),
        model: this.config.model,
      };

      logger.info(`AI 分析完成: ${analysisType}`);
      return analysisResult;
    } catch (error) {
      logger.error(`AI 分析过程中出错: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 综合分析论文（执行所有启用的分析类型）
   */
  async comprehensiveAnalysis(
    paperInfo: PaperInfo
  ): Promise<AIAnalysisResult | null> {
    if (!this.config.enabled || !this.config.analysisTypes) {
      return null;
    }

    try {
      logger.info(`开始综合 AI 分析: ${paperInfo.title}`);

      const analysisResults: Partial<AIAnalysisResult> = {
        processedAt: new Date(),
        model: this.config.model,
      };

      // 并行执行所有分析类型
      const analysisPromises = this.config.analysisTypes.map(
        async (analysisType) => {
          try {
            const result = await this.analyzePaper(paperInfo, analysisType);
            return { analysisType, result };
          } catch (error) {
            logger.error(`分析类型 ${analysisType} 失败:`, error);
            return { analysisType, result: null };
          }
        }
      );

      const analyses = await Promise.all(analysisPromises);

      // 合并分析结果
      for (const { analysisType, result } of analyses) {
        if (result) {
          Object.assign(analysisResults, result);
        }
      }

      logger.info(`综合 AI 分析完成: ${paperInfo.title}`);
      return analysisResults as AIAnalysisResult;
    } catch (error) {
      logger.error(`综合 AI 分析失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 批量分析论文
   */
  async analyzeMultiplePapers(papers: PaperInfo[]): Promise<PaperInfo[]> {
    if (!this.config.enabled || !this.config.analysisTypes) {
      logger.info('AI 分析已禁用或未配置分析类型');
      return papers;
    }

    logger.info(`开始批量 AI 分析，共 ${papers.length} 篇论文`);
    const results: PaperInfo[] = [];

    for (let i = 0; i < papers.length; i++) {
      const paper = papers[i];
      logger.info(`处理论文 ${i + 1}/${papers.length}: ${paper.title}`);

      try {
        const analysisResult = await this.comprehensiveAnalysis(paper);

        const enhancedPaper: PaperInfo = {
          ...paper,
          aiAnalysis: analysisResult || undefined,
        };

        results.push(enhancedPaper);

        // 添加延迟以避免速率限制
        if (i < papers.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.error(`分析论文 "${paper.title}" 时出错:`, error);
        results.push(paper); // 添加原始论文，不包含AI分析
      }
    }

    logger.info(
      `批量 AI 分析完成，成功分析 ${
        results.filter((p) => p.aiAnalysis).length
      } 篇论文`
    );
    return results;
  }

  /**
   * 检查 AI 服务是否可用
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const testMessage = new HumanMessage('测试连接');
      await this.llm.invoke([testMessage]);
      return true;
    } catch (error) {
      logger.error('AI 服务不可用:', error);
      return false;
    }
  }
}

/**
 * 创建 AI 分析器实例
 */
export function createPaperAnalyzer(config: AIConfig): PaperAnalyzer {
  return new PaperAnalyzer(config);
}
