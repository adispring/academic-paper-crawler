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
  // 滚动加载配置
  scrollConfig?: ScrollConfig;
}

/**
 * 滚动加载配置接口
 */
export interface ScrollConfig {
  enabled: boolean;
  maxScrolls: number;
  maxRetries: number;
  scrollDelay: number;
  detectLoadMore: boolean;
  // 人类式滚动配置
  humanLike: boolean; // 是否启用人类式滚动
  scrollStepsMin: number; // 最小滚动步数
  scrollStepsMax: number; // 最大滚动步数
  stepDelayMin: number; // 步骤间最小延迟(ms)
  stepDelayMax: number; // 步骤间最大延迟(ms)
  randomBackscroll: boolean; // 是否随机回看
  backscrollChance: number; // 回看概率(0-1)
}

/**
 * 搜索结果项接口
 */
export interface SearchResultItem {
  title: string;
  authors: string[];
  detailUrl: string; // 详情页链接，用于获取摘要
  paperLink?: string; // 真正的论文链接（PDF、DOI等）
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
  // 翻译配置
  enableTranslation?: boolean;
  translationMode?: 'always' | 'non-chinese-only' | 'disabled';
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
