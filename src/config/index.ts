import { CrawlerConfig, AIConfig, AIAnalysisType } from '../types';

/**
 * 默认爬虫配置
 */
export const defaultCrawlerConfig: CrawlerConfig = {
  baseUrl: 'https://programs.sigchi.org/facct/2025/search/content',
  maxRetries: 3,
  retryDelay: 2000,
  timeout: 60000,
  headless: true,
  outputFormat: 'csv',
  outputPath: './output',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  aiConfig: {
    model: 'gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 1000,
    enabled: false,
    baseURL: undefined,
    analysisTypes: [
      AIAnalysisType.SUMMARIZE,
      AIAnalysisType.EXTRACT_KEYWORDS,
      AIAnalysisType.RELEVANCE,
    ],
    // AI辅助提取配置
    enableExtraction: false,
    extractionMode: 'fallback',
    // Browser-Use 配置
    useBrowserUse: false,
    browserUseMode: 'hybrid',
    // 翻译配置
    enableTranslation: false,
    translationMode: 'non-chinese-only',
  },
};

/**
 * 默认AI配置
 */
export const defaultAIConfig: AIConfig = {
  model: 'gpt-4o-mini',
  temperature: 0.3,
  maxTokens: 1000,
  enabled: false,
  baseURL: undefined,
  analysisTypes: [
    AIAnalysisType.SUMMARIZE,
    AIAnalysisType.EXTRACT_KEYWORDS,
    AIAnalysisType.RELEVANCE,
  ],
  // AI辅助提取配置
  enableExtraction: false,
  extractionMode: 'fallback',
  // Browser-Use 配置
  useBrowserUse: false,
  browserUseMode: 'hybrid',
  // 翻译配置
  enableTranslation: false,
  translationMode: 'non-chinese-only',
};

/**
 * AI 提示模板配置
 */
export const aiPrompts = {
  summarize: `请为以下学术论文的摘要生成一个简洁的总结（不超过200字）：

标题：{title}
作者：{authors}
摘要：{abstract}

总结：`,

  classify: `请对以下学术论文进行分类，从这些类别中选择最合适的一个：
- 人工智能
- 机器学习
- 自然语言处理
- 计算机视觉
- 人机交互
- 数据科学
- 软件工程
- 其他

标题：{title}
摘要：{abstract}

分类：`,

  extractKeywords: `请从以下学术论文中提取5-10个关键词，用逗号分隔：

标题：{title}
摘要：{abstract}

关键词：`,

  sentiment: `请分析以下学术论文摘要的情感倾向（积极/消极/中性）：

摘要：{abstract}

情感倾向：`,

  relevance: `请评估以下论文与搜索关键词"{keyword}"的相关性，评分范围0-10（10表示高度相关）：

标题：{title}
摘要：{abstract}

相关性评分：`,
};

/**
 * 页面选择器配置
 */
export const selectors = {
  searchResults: '.search-result-item, .result-item, .paper-item',
  paperTitle: 'h3, .title, .paper-title, a[href*="paper"]',
  paperAuthors: '.authors, .author, .author-list',
  detailLink: 'a[href*="paper"], a[href*="detail"]',

  detailTitle: 'h1, .paper-title, .title',
  detailAuthors: '.authors, .author-list, .paper-authors',
  detailAbstract: '.abstract, .paper-abstract, .summary',
  detailPaperLink: 'a[href*="pdf"], a[href*="paper"], a[href*="download"]',

  loadingIndicator: '.loading, .spinner',
  errorMessage: '.error, .alert-error',
};

/**
 * 延迟配置
 */
export const delays = {
  pageLoad: 3000,
  betweenRequests: 1000,
  retryDelay: 2000,
  scrollDelay: 500,
};
