import { CrawlerConfig, AIConfig } from '../types';

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
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

/**
 * 默认AI配置
 */
export const defaultAIConfig: AIConfig = {
  model: 'gpt-3.5-turbo',
  temperature: 0.3,
  maxTokens: 1000,
  enabled: false
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
  errorMessage: '.error, .alert-error'
};

/**
 * 延迟配置
 */
export const delays = {
  pageLoad: 3000,
  betweenRequests: 1000,
  retryDelay: 2000,
  scrollDelay: 500
};
