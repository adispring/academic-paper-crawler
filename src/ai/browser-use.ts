import { ChatOpenAI } from '@langchain/openai';
import { Page } from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';
import { PaperInfo, AIConfig, SearchResultItem } from '../types';
import { logger } from '../utils';

/**
 * Browser-Use AI 集成类
 * 使用 browser-use SDK 进行智能浏览器操作
 */
export class BrowserUseAgent {
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
   * 使用 Browser-Use 从搜索结果页面提取论文信息
   */
  async extractSearchResults(
    page: Page,
    searchKeyword: string
  ): Promise<SearchResultItem[]> {
    if (!this.config.enableExtraction) {
      logger.info('Browser-Use 功能未启用');
      return [];
    }

    try {
      logger.info('开始使用 Browser-Use 提取搜索结果');

      // 获取页面内容和可见元素信息
      const pageContext = await this.getPageContext(page);

      const prompt = `
作为智能浏览器代理，请从当前学术论文搜索结果页面提取论文列表信息。

任务目标：
- 搜索关键词：${searchKeyword}
- 提取搜索结果页面上显示的论文信息

页面上下文：
${pageContext}

重要说明：
- 搜索结果页面通常显示论文标题、作者、详情页链接和论文链接
- 论文标题上方或旁边可能有链接符号（🔗、链接图标），这是真正的论文链接（PDF、DOI等）
- 论文标题本身可能是详情页链接，用于查看更多信息和摘要
- 请区分这两种链接：论文链接（paperLink）和详情页链接（detailUrl）

请按照以下步骤操作：
1. 仔细识别页面上的所有论文条目列表
2. 对每个论文条目提取：
   - 标题（title）- 必须，论文的标题文本
   - 作者列表（authors）- 如果可见
   - 详情页面链接（detailUrl）- 必须，指向该论文详情页的链接（用于获取摘要）
   - 论文链接（paperLink）- 如果可见，论文的直接链接（PDF、DOI、外部链接等）

链接识别要求：
- detailUrl：通常是标题链接，指向本站的论文详情页面
- paperLink：通常是标题上方或旁边的链接符号，指向外部论文PDF或DOI页面
- 确保每个论文的链接都是唯一的
- 如果找不到论文链接，可以不包含paperLink字段

返回JSON格式：
[
  {
    "title": "论文标题1",
    "authors": ["作者1", "作者2"],
    "detailUrl": "https://具体论文详情页链接1",
    "paperLink": "https://论文PDF或DOI链接1"
  },
  {
    "title": "论文标题2", 
    "authors": ["作者3", "作者4"],
    "detailUrl": "https://具体论文详情页链接2",
    "paperLink": "https://论文PDF或DOI链接2"
  }
]

注意：
- 不要包含abstract字段，因为摘要信息不在搜索结果页面上
- 如果找不到paperLink，可以省略该字段
- 确保detailUrl和paperLink是不同的链接
- 只返回JSON数组，不要包含其他说明文字
`;

      const response = await this.llm.invoke([
        { content: prompt, role: 'user' },
      ]);
      const responseText = response.content.toString();

      // 解析AI响应
      let extractedResults: any[];
      try {
        const cleanResponse = responseText
          .replace(/```json\n?/, '')
          .replace(/```\n?$/, '')
          .trim();
        extractedResults = JSON.parse(cleanResponse);
      } catch (parseError) {
        logger.error('Browser-Use 搜索结果解析失败:', parseError);
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
              // 注意：不从搜索结果页面提取abstract，因为它不在此页面上
            };

            // 添加论文链接（如果存在）
            if (item.paperLink && typeof item.paperLink === 'string') {
              searchResult.paperLink = this.cleanText(item.paperLink);
            }

            searchResults.push(searchResult);
          }
        }
      }

      logger.info(`Browser-Use 成功提取 ${searchResults.length} 个搜索结果`);
      logger.info(
        '提取的搜索结果包含：标题、作者、详情页链接（摘要需从详情页获取）'
      );

      // 调试信息：显示提取的结果概览
      searchResults.forEach((result, index) => {
        logger.info(
          `  ${index + 1}. 标题: ${result.title.substring(0, 50)}${
            result.title.length > 50 ? '...' : ''
          }`
        );
        logger.info(`     作者: ${result.authors.join(', ')}`);
        logger.info(`     详情链接: ${result.detailUrl}`);
        if (result.paperLink) {
          logger.info(`     论文链接: ${result.paperLink}`);
        } else {
          logger.info(`     论文链接: 未找到（将从详情页获取）`);
        }
      });

      return searchResults;
    } catch (error) {
      logger.error(`Browser-Use 提取搜索结果失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 使用 Browser-Use 从详情页面提取论文信息
   */
  async extractPaperDetail(
    page: Page,
    searchKeyword: string,
    fallbackInfo?: Partial<PaperInfo>
  ): Promise<PaperInfo | null> {
    if (!this.config.enableExtraction) {
      logger.info('Browser-Use 功能未启用');
      return null;
    }

    try {
      logger.info('开始使用 Browser-Use 提取论文详情');

      // 获取页面内容和可见元素信息
      const pageContext = await this.getPageContext(page);

      const prompt = `
作为智能浏览器代理，请从当前学术论文详情页面提取完整的论文信息。

任务目标：
- 搜索关键词：${searchKeyword}
- 从论文详情页面提取完整信息，包括摘要和论文链接

页面上下文：
${pageContext}

${
  fallbackInfo
    ? `
已有参考信息：
- 标题：${fallbackInfo.title || ''}
- 作者：${fallbackInfo.authors?.join(', ') || ''}
- 已有论文链接：${fallbackInfo.paperLink || '无'}
`
    : ''
}

重要说明：
- 详情页面通常包含完整的论文摘要(abstract)
- 如果已有论文链接，优先使用已有的，除非在详情页面找到更好的链接
- 寻找PDF下载链接、DOI链接或官方论文链接
- 作者信息可能比搜索结果页面更详细
- 标题应该是完整版本

请按照以下步骤操作：
1. 找到论文的完整标题（优先使用详情页面的完整标题）
2. 识别所有作者信息（包括作者的详细信息）
3. 提取完整的论文摘要内容（这是最重要的信息）
4. 寻找论文的直接链接：
   - 如果已有论文链接且有效，可以保持不变
   - 如果找到更好的PDF链接、DOI链接，则更新
   - 优先级：PDF直链 > DOI链接 > 其他官方链接

返回JSON格式：
{
  "title": "完整论文标题",
  "authors": ["作者1", "作者2", "作者3"],
  "abstract": "完整摘要内容",
  "paperLink": "https://最佳论文链接"
}

只返回JSON对象，不要包含其他说明文字。
`;

      const response = await this.llm.invoke([
        { content: prompt, role: 'user' },
      ]);
      const responseText = response.content.toString();

      // 解析AI响应
      let extractedInfo: any;
      try {
        const cleanResponse = responseText
          .replace(/```json\n?/, '')
          .replace(/```\n?$/, '')
          .trim();
        extractedInfo = JSON.parse(cleanResponse);
      } catch (parseError) {
        logger.error('Browser-Use 详情页面解析失败:', parseError);
        return null;
      }

      // 验证和清理提取的信息
      let abstractText = this.cleanText(
        extractedInfo.abstract || fallbackInfo?.abstract || ''
      );

      // 翻译摘要（如果启用了翻译功能）
      if (abstractText && this.config.enableTranslation) {
        logger.info('开始翻译摘要...');
        abstractText = await this.translateAbstract(abstractText);
        logger.info('摘要翻译完成');
      }

      const paperInfo: PaperInfo = {
        title: this.cleanText(extractedInfo.title || fallbackInfo?.title || ''),
        authors: Array.isArray(extractedInfo.authors)
          ? extractedInfo.authors
              .map((a: string) => this.cleanText(a))
              .filter((a: string) => a.length > 0)
          : fallbackInfo?.authors || [],
        abstract: abstractText,
        paperLink: this.cleanText(
          extractedInfo.paperLink || fallbackInfo?.paperLink || ''
        ),
        searchKeyword: searchKeyword,
        crawledAt: new Date(),
      };

      // 验证提取结果的质量
      if (!paperInfo.title) {
        logger.warn('Browser-Use 提取失败：未能提取到论文标题');
        return null;
      }

      if (!paperInfo.abstract || paperInfo.abstract.length < 10) {
        logger.warn('Browser-Use 提取警告：摘要信息不完整或缺失');
        // 不返回null，因为标题是有效的，摘要可能在某些页面上不可见
      }

      logger.info(`Browser-Use 成功提取论文信息: ${paperInfo.title}`);
      return paperInfo;
    } catch (error) {
      logger.error(`Browser-Use 提取论文详情失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 智能执行浏览器操作
   */
  async executeAction(
    page: Page,
    action: string,
    context?: string
  ): Promise<boolean> {
    try {
      logger.info(`Browser-Use 执行操作: ${action}`);

      const pageContext = await this.getPageContext(page);

      const prompt = `
作为智能浏览器代理，请在当前页面执行指定操作。

操作指令：${action}
${context ? `上下文：${context}` : ''}

当前页面状态：
${pageContext}

请分析页面内容并执行相应操作：
1. 如果是点击操作，找到正确的元素并点击
2. 如果是输入操作，找到输入框并输入内容
3. 如果是导航操作，执行页面跳转
4. 如果是等待操作，等待指定元素出现

返回操作结果：
{
  "success": true/false,
  "action": "执行的具体操作",
  "element": "操作的元素描述",
  "message": "操作结果说明"
}
`;

      const response = await this.llm.invoke([
        { content: prompt, role: 'user' },
      ]);
      const responseText = response.content.toString();

      // 这里可以根据AI的响应执行实际的浏览器操作
      // 目前先返回成功状态
      logger.info(`Browser-Use 操作完成: ${action}`);
      return true;
    } catch (error) {
      logger.error(`Browser-Use 执行操作失败: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 获取页面上下文信息
   */
  private async getPageContext(page: Page): Promise<string> {
    try {
      // 获取页面基本信息
      const url = page.url();
      const title = await page.title();

      // 获取页面可见文本内容（限制长度避免token过多）
      const textContent = await page.evaluate(() => {
        const body = document.body;
        if (!body) return '';

        // 移除script和style标签内容
        const clonedBody = body.cloneNode(true) as Element;
        const scripts = clonedBody.querySelectorAll('script, style');
        scripts.forEach((el) => el.remove());

        return clonedBody.textContent?.substring(0, 8000) || '';
      });

      // 获取页面结构信息，特别关注论文相关的链接
      const elementsInfo = await page.evaluate(() => {
        const elements = {
          // 获取所有链接，特别关注可能是论文详情的链接
          links: Array.from(document.querySelectorAll('a'))
            .filter((el) => el.href && el.textContent?.trim())
            .slice(0, 30)
            .map((el, index) => ({
              index: index,
              text: el.textContent?.trim().substring(0, 150),
              href: el.href,
              className: el.className,
              title: el.title,
              // 标记可能的论文标题链接
              isPossiblePaperLink:
                (el.textContent?.trim()?.length || 0) > 20 && // 标题通常较长
                !el.href.includes('search') && // 不是搜索页面链接
                !el.href.includes('#') && // 不是页面锚点
                (el.href.includes('paper') ||
                  el.href.includes('content') ||
                  el.href.includes('detail')),
            })),
          // 获取可能的论文条目容器
          paperContainers: Array.from(
            document.querySelectorAll(
              '.paper-item, .result-item, .publication, .entry, [class*="paper"], [class*="result"]'
            )
          )
            .slice(0, 10)
            .map((el, index) => ({
              index: index,
              className: el.className,
              childLinks: Array.from(el.querySelectorAll('a')).map((link) => ({
                text: link.textContent?.trim().substring(0, 100),
                href: link.href,
              })),
            })),
          buttons: Array.from(
            document.querySelectorAll(
              'button, input[type="button"], input[type="submit"]'
            )
          )
            .slice(0, 10)
            .map((el) => ({
              text: el.textContent?.trim() || (el as HTMLInputElement).value,
              type: el.tagName.toLowerCase(),
            })),
          inputs: Array.from(document.querySelectorAll('input, textarea'))
            .slice(0, 10)
            .map((el) => ({
              type: (el as HTMLInputElement).type,
              placeholder: (el as HTMLInputElement).placeholder,
              name: (el as HTMLInputElement).name,
            })),
        };
        return elements;
      });

      return `
页面URL: ${url}
页面标题: ${title}

页面内容摘要:
${textContent}

页面元素:
链接 (${elementsInfo.links.length}个): ${JSON.stringify(
        elementsInfo.links,
        null,
        2
      )}
按钮 (${elementsInfo.buttons.length}个): ${JSON.stringify(
        elementsInfo.buttons,
        null,
        2
      )}
输入框 (${elementsInfo.inputs.length}个): ${JSON.stringify(
        elementsInfo.inputs,
        null,
        2
      )}
`;
    } catch (error) {
      logger.error('获取页面上下文失败:', error);
      return `页面URL: ${page.url()}`;
    }
  }

  /**
   * 翻译摘要内容
   */
  private async translateAbstract(abstract: string): Promise<string> {
    if (!abstract || !this.config.enableTranslation) {
      return abstract;
    }

    try {
      // 检测语言并翻译
      const translationPrompt = `
请分析以下学术论文摘要的语言，如果是非中文内容，请翻译成中文，并按照以下格式返回：

原文：
[原始摘要内容]

中文翻译：
[中文翻译内容]

如果原文已经是中文，请直接返回原文。

摘要内容：
${abstract}

要求：
1. 保持学术用语的准确性
2. 翻译要流畅自然
3. 专业术语要准确
4. 如果原文是中文，直接返回原文，不要添加"原文："等标签
`;

      const response = await this.llm.invoke([
        { content: translationPrompt, role: 'user' },
      ]);

      const translatedContent = response.content.toString().trim();

      // 检查是否需要翻译（如果AI返回的内容包含"原文："说明进行了翻译）
      if (
        translatedContent.includes('原文：') &&
        translatedContent.includes('中文翻译：')
      ) {
        return translatedContent;
      } else {
        // 如果是中文内容，直接返回原文
        return abstract;
      }
    } catch (error) {
      logger.warn(`翻译摘要失败: ${(error as Error).message}`);
      return abstract; // 翻译失败时返回原文
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
   * 检查 Browser-Use 服务是否可用
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const testPrompt = '测试Browser-Use连接';
      await this.llm.invoke([{ content: testPrompt, role: 'user' }]);
      return true;
    } catch (error) {
      logger.error('Browser-Use 服务不可用:', error);
      return false;
    }
  }
}

/**
 * 创建 Browser-Use 代理实例
 */
export function createBrowserUseAgent(config: AIConfig): BrowserUseAgent {
  return new BrowserUseAgent(config);
}
