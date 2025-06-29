import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import {
  PaperInfo,
  AIConfig,
  AIAnalysisResult,
  AIAnalysisType,
  SearchResultItem,
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
   * AI辅助提取论文信息（从HTML内容中）
   */
  async extractPaperInfoFromHTML(
    htmlContent: string,
    searchKeyword: string,
    fallbackInfo?: Partial<PaperInfo>
  ): Promise<PaperInfo | null> {
    logger.info('**************** extractPaperInfoFromHTML ****************');
    if (!this.config.enableExtraction) {
      logger.info('AI辅助提取功能未启用');
      return null;
    }

    try {
      logger.info('开始使用AI从HTML内容中提取论文信息');

      const prompt = `
请从以下HTML内容中提取学术论文的关键信息，并以JSON格式返回。

HTML内容：
${htmlContent.substring(0, 8000)}

请提取以下信息：
1. title（论文标题）
2. authors（作者列表，数组格式）
3. abstract（摘要）
4. paperLink（论文PDF链接或详情链接）

要求：
- 只返回JSON格式，不要添加任何解释文字
- 如果某个字段找不到，设置为空字符串或空数组
- 作者列表请清理格式，去除多余符号
- 摘要需要完整提取，保持原文
- 链接请提取最相关的PDF或详情链接

JSON格式示例：
{
  "title": "论文标题",
  "authors": ["作者1", "作者2"],
  "abstract": "论文摘要内容...",
  "paperLink": "https://..."
}
`;

      const response = await this.invokeWithRetry(prompt);

      // 尝试解析JSON响应
      let extractedInfo;
      try {
        // 清理响应，移除可能的markdown格式
        const cleanResponse = response
          .replace(/```json\n?/, '')
          .replace(/```\n?$/, '')
          .trim();
        extractedInfo = JSON.parse(cleanResponse);
      } catch (parseError) {
        logger.error('AI响应JSON解析失败:', parseError);
        return null;
      }

      // 验证和清理提取的信息
      const paperInfo: PaperInfo = {
        title: this.cleanText(extractedInfo.title || fallbackInfo?.title || ''),
        authors: Array.isArray(extractedInfo.authors)
          ? extractedInfo.authors
              .map((a: string) => this.cleanText(a))
              .filter((a: string) => a.length > 0)
          : fallbackInfo?.authors || [],
        abstract: this.cleanText(
          extractedInfo.abstract || fallbackInfo?.abstract || ''
        ),
        paperLink: this.cleanText(
          extractedInfo.paperLink || fallbackInfo?.paperLink || ''
        ),
        searchKeyword: searchKeyword,
        crawledAt: new Date(),
      };

      // 验证提取结果的质量
      if (!paperInfo.title && !paperInfo.abstract) {
        logger.warn('AI提取失败：未能提取到有效的标题或摘要');
        return null;
      }

      logger.info(`AI成功提取论文信息: ${paperInfo.title}`);
      return paperInfo;
    } catch (error) {
      logger.error(`AI辅助提取失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * AI辅助增强提取结果
   */
  async enhanceExtractedInfo(
    originalInfo: PaperInfo,
    htmlContent?: string
  ): Promise<PaperInfo> {
    if (
      !this.config.enableExtraction ||
      this.config.extractionMode !== 'enhance'
    ) {
      return originalInfo;
    }

    try {
      logger.info(`开始AI增强提取结果: ${originalInfo.title}`);

      const prompt = `
请帮助改善和增强以下学术论文信息的质量：

原始信息：
标题: ${originalInfo.title}
作者: ${originalInfo.authors.join(', ')}
摘要: ${originalInfo.abstract}
链接: ${originalInfo.paperLink}

${htmlContent ? `\n参考HTML内容:\n${htmlContent.substring(0, 4000)}` : ''}

请执行以下优化：
1. 清理和格式化标题（去除多余符号和空格）
2. 标准化作者姓名格式
3. 改善摘要质量（如果摘要不完整，尝试从HTML中找到更完整的版本）
4. 验证和优化链接

返回JSON格式：
{
  "title": "清理后的标题",
  "authors": ["标准化的作者1", "标准化的作者2"],
  "abstract": "改善后的摘要",
  "paperLink": "验证后的链接"
}
`;

      const response = await this.invokeWithRetry(prompt);

      let enhancedInfo;
      try {
        const cleanResponse = response
          .replace(/```json\n?/, '')
          .replace(/```\n?$/, '')
          .trim();
        enhancedInfo = JSON.parse(cleanResponse);
      } catch (parseError) {
        logger.warn('AI增强响应解析失败，使用原始信息');
        return originalInfo;
      }

      const enhancedPaperInfo: PaperInfo = {
        ...originalInfo,
        title: this.cleanText(enhancedInfo.title) || originalInfo.title,
        authors:
          Array.isArray(enhancedInfo.authors) && enhancedInfo.authors.length > 0
            ? enhancedInfo.authors
                .map((a: string) => this.cleanText(a))
                .filter((a: string) => a.length > 0)
            : originalInfo.authors,
        abstract:
          this.cleanText(enhancedInfo.abstract) || originalInfo.abstract,
        paperLink:
          this.cleanText(enhancedInfo.paperLink) || originalInfo.paperLink,
      };

      logger.info(`AI增强完成: ${enhancedPaperInfo.title}`);
      return enhancedPaperInfo;
    } catch (error) {
      logger.error(`AI增强提取失败: ${(error as Error).message}`);
      return originalInfo;
    }
  }

  /**
   * 清理文本内容
   */
  private cleanText(text: string): string {
    if (!text || typeof text !== 'string') return '';

    return text
      .replace(/\s+/g, ' ') // 合并多个空白字符
      .replace(/[\r\n\t]/g, ' ') // 替换换行和制表符
      .trim() // 去除首尾空白
      .replace(/[""'']/g, '"') // 标准化引号
      .replace(/[…]/g, '...'); // 标准化省略号
  }

  /**
   * AI辅助提取搜索结果页面的论文列表
   */
  async extractSearchResultsFromHTML(
    htmlContent: string,
    searchKeyword: string
  ): Promise<SearchResultItem[]> {
    if (!this.config.enableExtraction) {
      logger.info('AI辅助提取功能未启用');
      return [];
    }

    try {
      logger.info('开始使用AI从搜索结果页面提取论文列表');

      const prompt = `
请从以下HTML内容中提取学术论文搜索结果列表，并以JSON格式返回。

搜索关键词：${searchKeyword}

HTML内容：
${htmlContent.substring(0, 12000)}

请提取搜索结果中的所有论文信息，每个论文包含以下字段：
1. title（论文标题）
2. authors（作者列表，数组格式）
3. detailUrl（论文详情页链接）
4. abstract（摘要，如果在搜索结果中可见）

要求：
- 只返回JSON格式的数组，不要添加任何解释文字
- 如果某个字段找不到，设置为空字符串或空数组
- 作者列表请清理格式，去除多余符号和空格
- 链接请确保是完整的URL
- 如果页面中没有找到论文，返回空数组 []

JSON格式示例：
[
  {
    "title": "论文标题1",
    "authors": ["作者1", "作者2"],
    "detailUrl": "https://...",
    "abstract": "摘要内容（如果有）"
  },
  {
    "title": "论文标题2", 
    "authors": ["作者3"],
    "detailUrl": "https://...",
    "abstract": ""
  }
]
`;

      const response = await this.invokeWithRetry(prompt, 2);

      // 尝试解析JSON响应
      let extractedResults: any[];
      try {
        // 清理响应，移除可能的markdown格式
        const cleanResponse = response
          .replace(/```json\n?/, '')
          .replace(/```\n?$/, '')
          .trim();
        extractedResults = JSON.parse(cleanResponse);
      } catch (parseError) {
        logger.error('AI搜索结果响应JSON解析失败:', parseError);
        return [];
      }

      // 验证和清理提取的信息
      const searchResults: SearchResultItem[] = [];

      if (Array.isArray(extractedResults)) {
        for (const item of extractedResults) {
          if (item && item.title && item.detailUrl) {
            const searchResult: SearchResultItem = {
              title: this.cleanText(item.title),
              authors: Array.isArray(item.authors)
                ? item.authors
                    .map((a: string) => this.cleanText(a))
                    .filter((a: string) => a.length > 0)
                : [],
              detailUrl: this.cleanText(item.detailUrl),
              // 如果搜索结果中包含摘要，也保存下来
              ...(item.abstract && { abstract: this.cleanText(item.abstract) }),
            };

            searchResults.push(searchResult);
          }
        }
      }

      logger.info(`AI成功从搜索结果页面提取到 ${searchResults.length} 个论文`);
      return searchResults;
    } catch (error) {
      logger.error(`AI辅助提取搜索结果失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * AI辅助增强搜索结果
   */
  async enhanceSearchResults(
    originalResults: SearchResultItem[],
    htmlContent: string,
    searchKeyword: string
  ): Promise<SearchResultItem[]> {
    if (
      !this.config.enableExtraction ||
      this.config.extractionMode !== 'enhance'
    ) {
      return originalResults;
    }

    try {
      logger.info(`开始AI增强搜索结果，共 ${originalResults.length} 个结果`);

      const prompt = `
请帮助改善和增强以下学术论文搜索结果的质量：

搜索关键词：${searchKeyword}

原始搜索结果：
${JSON.stringify(originalResults.slice(0, 10), null, 2)}

参考HTML内容：
${htmlContent.substring(0, 8000)}

请执行以下优化：
1. 清理和格式化论文标题（去除多余符号和空格）
2. 标准化作者姓名格式
3. 补充缺失的作者信息（如果HTML中有）
4. 验证和修正详情链接
5. 如果可能，从HTML中补充缺失的摘要信息

返回增强后的JSON数组：
[
  {
    "title": "清理后的标题",
    "authors": ["标准化的作者1", "标准化的作者2"],
    "detailUrl": "验证后的链接",
    "abstract": "补充的摘要（如果有）"
  }
]
`;

      const response = await this.invokeWithRetry(prompt);

      let enhancedResults;
      try {
        const cleanResponse = response
          .replace(/```json\n?/, '')
          .replace(/```\n?$/, '')
          .trim();
        enhancedResults = JSON.parse(cleanResponse);
      } catch (parseError) {
        logger.warn('AI搜索结果增强响应解析失败，使用原始结果');
        return originalResults;
      }

      if (Array.isArray(enhancedResults)) {
        const processedResults: SearchResultItem[] = [];

        for (
          let i = 0;
          i < Math.min(enhancedResults.length, originalResults.length);
          i++
        ) {
          const enhanced = enhancedResults[i];
          const original = originalResults[i];

          processedResults.push({
            title: this.cleanText(enhanced.title) || original.title,
            authors:
              Array.isArray(enhanced.authors) && enhanced.authors.length > 0
                ? enhanced.authors
                    .map((a: string) => this.cleanText(a))
                    .filter((a: string) => a.length > 0)
                : original.authors,
            detailUrl: this.cleanText(enhanced.detailUrl) || original.detailUrl,
            ...(enhanced.abstract && {
              abstract: this.cleanText(enhanced.abstract),
            }),
          });
        }

        logger.info(`AI增强搜索结果完成`);
        return processedResults;
      }

      return originalResults;
    } catch (error) {
      logger.error(`AI增强搜索结果失败: ${(error as Error).message}`);
      return originalResults;
    }
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

// 导出 Browser-Use 相关模块
export { BrowserUseAgent, createBrowserUseAgent } from './browser-use';
