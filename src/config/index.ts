import {
  CrawlerConfig,
  AIConfig,
  AIAnalysisType,
  ScrollConfig,
} from '../types';

/**
 * 默认滚动配置
 */
export const defaultScrollConfig: ScrollConfig = {
  enabled: true,
  maxScrolls: 50,
  maxRetries: 3,
  scrollDelay: 2000,
  detectLoadMore: true,
  // 人类式滚动默认配置
  humanLike: true, // 默认启用人类式滚动
  scrollStepsMin: 3, // 最少3步滚动
  scrollStepsMax: 6, // 最多6步滚动
  stepDelayMin: 800, // 最小延迟0.8秒
  stepDelayMax: 1800, // 最大延迟1.8秒
  randomBackscroll: true, // 启用随机回看
  backscrollChance: 0.3, // 30%概率回看
  // 虚拟列表优化默认配置
  virtualListOptimization: true, // 默认启用虚拟列表优化
  virtualListScrollDelay: 3500, // 虚拟列表滚动后等待3.5秒
  virtualListMaxRetries: 6, // 虚拟列表最大重试6次
  virtualListCollectionThreshold: 0.85, // 收集到85%即可结束
};

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
  scrollConfig: defaultScrollConfig,
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
    // AI论文分析配置
    enableAnalysis: false, // 默认禁用AI论文分析
    // AI辅助提取配置
    enableExtraction: false,
    extractionMode: 'fallback',
    // 详情页提取配置
    enableDetailExtraction: true, // 默认启用详情页提取
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
  // AI论文分析配置
  enableAnalysis: false, // 默认禁用AI论文分析
  // AI辅助提取配置
  enableExtraction: false,
  extractionMode: 'fallback',
  // 详情页提取配置
  enableDetailExtraction: true, // 默认启用详情页提取
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
 * 针对 SIGCHI 网站结构优化
 */
export const selectors = {
  // SIGCHI 搜索结果选择器 - 基于实际HTML结构优化
  searchResults: `
    content-card, .search-item,
    .tab-content div[class*="row"] > div,
    .content-panel > div,
    [role="tabpanel"] > div,
    .tab-content > div,
    .search-results > div,
    article,
    .paper-item, .content-item, .result-item,
    .search-result, .publication,
    [class*="search-result"],
    [class*="content-item"],
    [class*="paper-item"],
    div[class*="col-"],
    .container > div,
    .row > div
  `
    .replace(/\s+/g, ' ')
    .trim(),

  // 论文标题选择器 - 基于实际HTML结构
  paperTitle: `
    .card-data-name .name, .name,
    h3, h4, h5,
    .title, .paper-title, .content-title,
    a[href*="paper"], a[href*="content"],
    [class*="title"], [data-title],
    strong, b
  `
    .replace(/\s+/g, ' ')
    .trim(),

  // 作者选择器 - 基于实际HTML结构
  paperAuthors: `
    person-list, .people-container, person-list a[person-link],
    .authors, .author, .author-list, .author-names,
    [class*="author"], [data-authors],
    .byline, .credits, .contributors,
    small, .text-muted, .secondary-text
  `
    .replace(/\s+/g, ' ')
    .trim(),

  // 详情链接选择器（标题链接）- 基于实际HTML结构
  detailLink: `
    .link-block.card-container, a.link-block,
    a[href*="paper"], a[href*="content"], a[href*="session"],
    h3 > a, h4 > a, h5 > a,
    .title > a, .paper-title > a,
    [data-link], [data-href]
  `
    .replace(/\s+/g, ' ')
    .trim(),

  // 论文链接选择器（左上角链接按钮） - 基于实际HTML结构
  paperLink: `
    link-list-btn button, .addon-links button, 
    button.link-icon, .link-icon, button[aria-label*="extra links"],
    a[href*="pdf"], a[href*="doi"], a[href*="acm.org"],
    a[href*="arxiv"], a[href*="paper"], a[href*="download"],
    .paper-link, .pdf-link, .external-link,
    a[title*="PDF"], a[title*="paper"], a[title*="DOI"],
    a[class*="link"], a[class*="external"],
    .fa-external-link, .fa-link, .fa-file-pdf,
    [data-type="paper-link"], [data-paper-url],
    .btn-link, .link-button,
    a[target="_blank"], 
    a.icon, a .icon,
    .fa, .glyphicon
  `
    .replace(/\s+/g, ' ')
    .trim(),

  // 详情页选择器 - 基于实际HTML结构
  detailTitle:
    'h1, h2, .paper-title, .title, .content-title, .card-data-name .name',
  detailAuthors: '.authors, .author-list, .paper-authors, .byline, person-list',
  detailAbstract:
    '.content-abstract, content-card-abstract, .abstract, .paper-abstract, .summary, .description, [class*="abstract"]',
  detailPaperLink:
    'link-list-btn button, .addon-links button, a[href*="pdf"], a[href*="paper"], a[href*="download"], a[href*="doi"]',

  // 加载相关选择器
  loadingIndicator:
    '.loading, .spinner, [class*="loading"], [class*="spinner"]',
  errorMessage: '.error, .alert-error, [class*="error"]',

  // SIGCHI 特定选择器
  contentTab: '[role="tab"], .tab, .nav-tab',
  contentPanel: '[role="tabpanel"], .tab-content, .content-panel',
  resultCount: '.result-count, [class*="count"], .total-results',
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
