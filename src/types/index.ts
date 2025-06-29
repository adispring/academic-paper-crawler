/**
 * 论文信息接口
 */
export interface PaperInfo {
  title: string;
  authors: string[];
  abstract: string;
  paperLink: string;
  searchKeyword: string;
  crawledAt: Date;
}

/**
 * 爬虫配置接口
 */
export interface CrawlerConfig {
  baseUrl: string;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  headless: boolean;
  outputFormat: 'csv' | 'json';
  outputPath: string;
  userAgent: string;
}

/**
 * 搜索结果项接口
 */
export interface SearchResultItem {
  title: string;
  authors: string[];
  detailUrl: string;
}

/**
 * 爬虫状态接口
 */
export interface CrawlerStatus {
  keyword: string;
  totalFound: number;
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}

/**
 * AI处理配置接口
 */
export interface AIConfig {
  apiKey?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
}
