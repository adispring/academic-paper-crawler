import * as fs from 'fs';
import * as path from 'path';

/**
 * 简单的日志记录器
 */
export const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args)
};

/**
 * 确保目录存在
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 休眠函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i === maxRetries) {
        throw lastError;
      }
      
      logger.warn(`重试第 ${i + 1} 次，延迟 ${delay}ms`, lastError.message);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}

/**
 * 清理文本内容
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
}

/**
 * 验证URL格式
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 生成时间戳文件名
 */
export function generateTimestampFilename(prefix: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${timestamp}.${extension}`;
}

/**
 * 获取相对URL的绝对URL
 */
export function getAbsoluteUrl(baseUrl: string, relativeUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
}

/**
 * 解析作者信息
 */
export function parseAuthors(authorsText: string): string[] {
  if (!authorsText) return [];
  
  return authorsText
    .split(/[,;，；\n]|\band\b/i)
    .map(author => cleanText(author))
    .filter(author => author.length > 0);
}

/**
 * 创建输出目录
 */
export function setupOutputDirectory(outputPath: string): void {
  ensureDirectoryExists(outputPath);
  ensureDirectoryExists(path.join(outputPath, 'logs'));
}
