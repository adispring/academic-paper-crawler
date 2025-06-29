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
  aiAnalysis?: AIAnalysisResult;
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
  aiConfig?: AIConfig;
}

/**
 * 搜索结果项接口
 */
export interface SearchResultItem {
  title: string;
  authors: string[];
  detailUrl: string;
  abstract?: string; // AI提取可能包含摘要
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
  baseURL?: string;
  analysisTypes?: AIAnalysisType[];
  // AI辅助提取配置
  enableExtraction?: boolean;
  extractionMode?: 'always' | 'fallback' | 'enhance';
  // Browser-Use 配置
  useBrowserUse?: boolean;
  browserUseMode?: 'hybrid' | 'browser-use-only' | 'traditional-only';
}

/**
 * AI 分析类型枚举
 */
export enum AIAnalysisType {
  SUMMARIZE = 'summarize',
  CLASSIFY = 'classify',
  EXTRACT_KEYWORDS = 'extract_keywords',
  SENTIMENT = 'sentiment',
  RELEVANCE = 'relevance',
}

/**
 * AI 分析结果接口
 */
export interface AIAnalysisResult {
  summary?: string;
  classification?: string;
  keywords?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  relevanceScore?: number;
  processedAt: Date;
  model: string;
}

/**
 * LangGraph 节点状态接口
 */
export interface GraphState {
  paperInfo: PaperInfo;
  analysisType: AIAnalysisType;
  result?: AIAnalysisResult;
  error?: string;
  retry?: number;
}
