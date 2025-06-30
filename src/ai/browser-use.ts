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
   * 虚拟滚动策略 - 与主爬虫保持一致
   */
  private async performVirtualListScroll(
    page: Page,
    context: {
      currentProgress: number;
      consecutiveNoNewItems: number;
      stagnationCount: number;
    }
  ): Promise<{ success: boolean; actualDistance: number }> {
    const { currentProgress, consecutiveNoNewItems, stagnationCount } = context;

    logger.info('Browser-Use 执行虚拟滚动策略...');

    const scrollInfo = await page.evaluate((ctx) => {
      return new Promise<any>((resolve) => {
        // 简化滚动策略：只使用Window滚动（经验证最有效）
        const viewportHeight = window.innerHeight;
        const currentY = window.scrollY;
        const maxY = document.documentElement.scrollHeight - viewportHeight;

        // 基于进度和状态计算滚动距离
        let scrollDistance = 0;

        if (ctx.currentProgress < 0.2) {
          scrollDistance = Math.floor(viewportHeight * 0.8); // 初期大步长
        } else if (ctx.currentProgress < 0.5) {
          scrollDistance = Math.floor(viewportHeight * 0.6); // 中期中步长
        } else if (ctx.currentProgress < 0.8) {
          scrollDistance = Math.floor(viewportHeight * 0.4); // 后期小步长
        } else {
          scrollDistance = Math.floor(viewportHeight * 0.2); // 接近完成时精细滚动
        }

        // 根据收集状态调整滚动策略
        if (ctx.consecutiveNoNewItems > 2) {
          // 连续无新项目：使用激进滚动
          scrollDistance = Math.floor(viewportHeight * 1.2);
        } else if (ctx.stagnationCount > 1) {
          // 停滞状态：使用精细滚动
          scrollDistance = Math.floor(viewportHeight * 0.15);
        }

        const targetScrollTop = Math.min(currentY + scrollDistance, maxY);

        console.info(
          `🎯 Browser-Use Window滚动: 当前=${currentY}, 距离=${scrollDistance}, 目标=${targetScrollTop}, 最大=${maxY}, 进度=${ctx.currentProgress.toFixed(
            2
          )}`
        );

        // 执行平滑滚动
        window.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth',
        });

        // 等待滚动完成
        setTimeout(() => {
          const finalY = window.scrollY;
          const actualDistance = finalY - currentY;
          const progress = maxY > 0 ? finalY / maxY : 0;

          resolve({
            method: 'window',
            scrollDistance,
            beforeScroll: currentY,
            afterScroll: finalY,
            targetScroll: targetScrollTop,
            maxScroll: maxY,
            progress,
            actualDistance,
            viewportHeight,
          });
        }, 800); // 给足时间让滚动完成
      });
    }, context);

    // 输出滚动结果
    logger.info(
      `🎯 Browser-Use 滚动执行: ${scrollInfo.beforeScroll} → ${scrollInfo.afterScroll} (移动${scrollInfo.actualDistance}px)`
    );
    logger.info(
      `   滚动进度: ${Math.round(
        (scrollInfo.progress || 0) * 100
      )}% | 视窗高度: ${scrollInfo.viewportHeight}px`
    );

    if (scrollInfo.actualDistance === 0 && scrollInfo.scrollDistance > 0) {
      logger.warn('⚠️ 滚动未产生移动，可能已到达页面底部');
      return { success: false, actualDistance: 0 };
    }

    return {
      success: scrollInfo.actualDistance > 10,
      actualDistance: scrollInfo.actualDistance,
    };
  }

  /**
   * 虚拟列表专用的滚动加载处理 - 优化版本
   */
  private async loadVirtualListResults(
    page: Page,
    expectedTotal: number
  ): Promise<SearchResultItem[]> {
    const maxScrolls = Math.max(30, Math.ceil(expectedTotal / 2)); // 动态调整最大滚动次数
    const maxRetries = 8;
    const baseDelay = 3500;
    const collectionThreshold = Math.max(0.75, 1); // 提高阈值下限

    logger.info(
      `🎯 开始Browser-Use虚拟列表收集: 期望${expectedTotal}个项目, 阈值${Math.round(
        collectionThreshold * 100
      )}%, 最大滚动${maxScrolls}次`
    );

    // 使用Map存储收集的项目，支持更多元数据
    const collectedItems = new Map<string, any>();
    let scrollCount = 0;
    let consecutiveNoNewItems = 0;
    let stagnationCount = 0;
    let retryCount = 0;
    let lastStableCount = 0;

    // 重新检测并更新期望总数（可能更准确）
    const updatedVirtualListInfo = await this.detectVirtualList(page);
    if (updatedVirtualListInfo.expectedTotal > expectedTotal) {
      expectedTotal = updatedVirtualListInfo.expectedTotal;
      logger.info(`📊 Browser-Use更新期望项目数为: ${expectedTotal}`);
    }

    while (scrollCount < maxScrolls && retryCount < maxRetries) {
      logger.info(
        `\n🔄 Browser-Use第${
          scrollCount + 1
        }次滚动 (重试${retryCount}/${maxRetries})`
      );

      try {
        // 等待DOM稳定
        await this.waitForVirtualListStable(page);

        // 提取当前页面项目
        const currentItems = await this.extractVirtualListItems(page);
        logger.info(
          `📦 Browser-Use当前页面提取到 ${currentItems.length} 个项目`
        );

        if (currentItems.length === 0) {
          logger.warn('⚠️ Browser-Use当前页面没有提取到任何项目');
          consecutiveNoNewItems++;

          if (consecutiveNoNewItems >= 3) {
            logger.warn('🔚 Browser-Use连续3次未提取到项目，可能已到列表末尾');
            break;
          }

          // 尝试更大步长滚动
          const context = {
            currentProgress: collectedItems.size / expectedTotal,
            consecutiveNoNewItems: consecutiveNoNewItems + 2, // 强制使用大步长
            stagnationCount: 0,
          };
          await this.performVirtualListScroll(page, context);

          const adaptiveDelay = this.calculateAdaptiveDelay(baseDelay, {
            consecutiveNoNewItems,
            stagnationCount,
            progressRatio: collectedItems.size / expectedTotal,
          });

          logger.info(`⏳ Browser-Use空页面等待 ${adaptiveDelay}ms`);
          await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));

          scrollCount++;
          continue;
        }

        // 分析新项目
        const analysis = this.analyzeCollectedItems(
          currentItems,
          collectedItems
        );

        // 将新项目添加到收集中
        analysis.newItems.forEach((item, index) => {
          collectedItems.set(item.uniqueId, {
            ...item,
            scrollIteration: scrollCount,
            extractionOrder: collectedItems.size + index + 1,
            timestamp: Date.now(),
          });
        });

        const currentTotal = collectedItems.size;
        const progressRatio = currentTotal / expectedTotal;
        const completionPercentage = Math.round(progressRatio * 100);

        logger.info(
          `📈 Browser-Use收集进度: ${currentTotal}/${expectedTotal} (${completionPercentage}%) | 新增${analysis.newItems.length}个, 重复${analysis.duplicates}个`
        );

        // 更新连续无新项目计数
        if (analysis.newItems.length === 0) {
          consecutiveNoNewItems++;
          logger.warn(`⚠️ Browser-Use连续 ${consecutiveNoNewItems} 次无新项目`);
        } else {
          consecutiveNoNewItems = 0;
        }

        // 检测是否停滞（收集数量没有显著增长）
        if (currentTotal === lastStableCount) {
          stagnationCount++;
        } else {
          stagnationCount = 0;
          lastStableCount = currentTotal;
        }

        // 提前完成条件检查（更严格）
        const shouldComplete =
          (progressRatio >= collectionThreshold &&
            consecutiveNoNewItems >= 2) || // 达到阈值且连续无新项目
          progressRatio >= 0.95 || // 达到95%
          currentTotal >= expectedTotal; // 达到或超过期望数

        if (shouldComplete) {
          logger.info(
            `✅ Browser-Use满足完成条件: 进度${completionPercentage}%, 连续无新项目${consecutiveNoNewItems}次`
          );
          break;
        }

        // 检测是否需要重试
        if (consecutiveNoNewItems >= 4 || stagnationCount >= 3) {
          retryCount++;
          logger.warn(
            `🔄 Browser-Use触发重试 ${retryCount}/${maxRetries}: 连续无新项目${consecutiveNoNewItems}次, 停滞${stagnationCount}次`
          );

          if (retryCount >= maxRetries) {
            logger.warn('🛑 Browser-Use达到最大重试次数，结束收集');
            break;
          }

          // 重试时重置状态并使用激进滚动
          consecutiveNoNewItems = 0;
          stagnationCount = 0;
        }

        // 计算滚动上下文
        const scrollContext = {
          currentProgress: progressRatio,
          consecutiveNoNewItems,
          stagnationCount,
        };

        // 执行自适应滚动
        await this.performVirtualListScroll(page, scrollContext);

        // 计算自适应延迟
        const adaptiveDelay = this.calculateAdaptiveDelay(baseDelay, {
          consecutiveNoNewItems,
          stagnationCount,
          progressRatio,
        });

        logger.info(`⏳ Browser-Use等待 ${adaptiveDelay}ms 后继续`);
        await new Promise((resolve) => setTimeout(resolve, adaptiveDelay));

        scrollCount++;

        // 定期输出详细统计
        if (scrollCount % 5 === 0) {
          this.logVirtualListCollectionStats(
            collectedItems,
            expectedTotal,
            scrollCount
          );
        }
      } catch (error) {
        logger.error(
          `Browser-Use滚动第${scrollCount + 1}次时出错: ${
            (error as Error).message
          }`
        );
        retryCount++;

        if (retryCount >= maxRetries) {
          logger.error('Browser-Use达到最大重试次数，停止收集');
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000)); // 错误时等待2秒
        scrollCount++;
      }
    }

    // 输出最终统计
    const finalTotal = collectedItems.size;
    const finalCompletionRate = Math.round((finalTotal / expectedTotal) * 100);

    logger.info('\n🎉 Browser-Use虚拟列表收集完成!');
    logger.info(
      `📊 Browser-Use最终统计: ${finalTotal}/${expectedTotal} (${finalCompletionRate}%)`
    );
    logger.info(`🔄 Browser-Use总滚动次数: ${scrollCount}`);
    logger.info(`🔁 Browser-Use重试次数: ${retryCount}/${maxRetries}`);
    logger.info(
      `⚡ Browser-Use平均效率: ${Math.round(
        finalTotal / Math.max(scrollCount, 1)
      )} 项/次滚动`
    );

    // 输出详细统计
    this.logVirtualListCollectionStats(
      collectedItems,
      expectedTotal,
      scrollCount
    );

    if (finalCompletionRate < 70) {
      logger.warn(
        `⚠️ Browser-Use收集完成率较低 (${finalCompletionRate}%)，可能需要调整参数`
      );
    } else if (finalCompletionRate >= 95) {
      logger.info('🎯 Browser-Use收集完成率excellent! (≥95%)');
    }

    // 转换为SearchResultItem格式并返回
    const searchResults: SearchResultItem[] = [];
    for (const [, item] of collectedItems) {
      searchResults.push({
        title: item.title,
        authors: item.authors,
        detailUrl: item.detailUrl,
        abstract: '', // 搜索结果阶段暂不包含摘要
      });
    }

    return searchResults;
  }

  /**
   * 使用 Browser-Use 从搜索结果页面提取论文信息
   * 参考loadAllSearchResults思路：检测虚拟列表 -> 选择合适的处理策略
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
      logger.info('开始使用 Browser-Use 统一虚拟滚动处理搜索结果');

      // 首先滚动到页面顶部确保从头开始
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 检测是否为虚拟列表
      const virtualListInfo = await this.detectVirtualList(page);

      if (virtualListInfo.isVirtualList) {
        logger.info(
          `Browser-Use检测到虚拟列表 (${virtualListInfo.framework})，期望项目数: ${virtualListInfo.expectedTotal}`
        );
        // 使用虚拟列表收集策略
        return await this.loadVirtualListResults(
          page,
          virtualListInfo.expectedTotal
        );
      } else {
        logger.info('Browser-Use检测到传统列表，使用虚拟滚动策略处理');
        // 对传统页面也使用虚拟滚动策略，设置合理的期望数量
        const estimatedTotal = virtualListInfo.expectedTotal || 50; // 默认期望50个
        logger.info(`Browser-Use估算期望项目数: ${estimatedTotal}`);

        // 使用简化的虚拟滚动处理传统列表
        return await this.loadVirtualListResults(page, estimatedTotal);
      }
    } catch (error) {
      logger.error(
        `Browser-Use 统一虚拟滚动处理失败: ${(error as Error).message}`
      );
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
  "paperLink": "真实的论文链接（如果找到的话）"
}

重要警告：
🚨 绝对禁止生成虚假或示例链接！
🚨 如果没有找到真实的论文链接，请省略paperLink字段，不要编造！
🚨 不要使用占位符如"XXXXXX"、"1234567"等生成虚假DOI！

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

      // 验证并清理论文链接
      let paperLink = '';
      const extractedLink = this.cleanText(
        extractedInfo.paperLink || fallbackInfo?.paperLink || ''
      );
      if (extractedLink && this.isValidPaperLink(extractedLink)) {
        paperLink = extractedLink;
      } else if (extractedLink) {
        logger.warn(`检测到无效论文链接，已忽略: ${extractedLink}`);
      }

      const paperInfo: PaperInfo = {
        title: this.cleanText(extractedInfo.title || fallbackInfo?.title || ''),
        authors: Array.isArray(extractedInfo.authors)
          ? extractedInfo.authors
              .map((a: string) => this.cleanText(a))
              .filter((a: string) => a.length > 0)
          : fallbackInfo?.authors || [],
        abstract: abstractText,
        paperLink: paperLink,
        detailUrl: fallbackInfo?.detailUrl || '', // 添加详情页URL
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
   * 验证论文链接是否有效（不是虚假或示例链接）
   */
  private isValidPaperLink(link: string): boolean {
    if (!link || link.length === 0) {
      return false;
    }

    // 检查是否是虚假或示例链接
    const invalidPatterns = [
      /XXXXXX/i,
      /123456\d/i, // 匹配 1234567, 1234568 等虚假数字
      /example/i,
      /placeholder/i,
      /sample/i,
      /\.\.\.$/, // 以...结尾的占位符
      /^https?:\/\/[^\/]*\/?$/, // 只有域名的不完整链接
    ];

    for (const pattern of invalidPatterns) {
      if (pattern.test(link)) {
        logger.warn(`检测到虚假链接，已过滤: ${link}`);
        return false;
      }
    }

    // 检查是否是有效的学术资源链接
    const validDomains = [
      'dl.acm.org',
      'doi.org',
      'arxiv.org',
      'ieee.org',
      'springer.com',
      'sciencedirect.com',
      'researchgate.net',
      'semanticscholar.org',
      'acm.org',
      'proceedings.',
    ];

    const hasValidDomain = validDomains.some((domain) => link.includes(domain));

    // 检查是否有有效的DOI格式 (10.xxxx/xxxx)
    const hasValidDOI = /10\.\d{4,}\/[^\s]+/.test(link);

    // 检查是否有PDF扩展名
    const isPDF = /\.pdf(\?|$)/i.test(link);

    return hasValidDomain || hasValidDOI || isPDF;
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

  /**
   * 检测虚拟列表并返回相关信息 - 针对FAccT网站优化
   */
  private async detectVirtualList(page: Page): Promise<{
    isVirtualList: boolean;
    expectedTotal: number;
    framework?: string;
    virtualScrollerHeight?: number;
    debugInfo?: {
      hasVirtualScroller: boolean;
      hasTotalPadding: boolean;
      hasScrollableContent: boolean;
      currentOffset: number;
      totalPaddingHeight: number;
    };
  }> {
    return await page.evaluate(() => {
      // 检测虚拟列表组件 - 针对FAccT/SIGCHI网站
      const hasVirtualScroller = !!document.querySelector('virtual-scroller');
      const hasTotalPadding = !!document.querySelector(
        '.total-padding, [class*="total-padding"]'
      );
      const hasScrollableContent = !!document.querySelector(
        '.scrollable-content, [class*="scrollable-content"]'
      );

      // 更精确地检测期望总数 - 针对FAccT 2025网站
      let expectedTotal = 0;

      // 方法1：从导航标签中提取（最准确）
      const navTabs = document.querySelectorAll(
        'nav[role="navigation"] a, .navbar-tabs a, sigchi-navbar-item, [sigchi-navbar-router-item]'
      );

      for (const tab of Array.from(navTabs)) {
        const tabText = tab.textContent || '';
        // 匹配 "Content (280)" 格式
        const contentMatch = tabText.match(/Content[^(]*\((\d+)\)/i);
        if (contentMatch) {
          expectedTotal = parseInt(contentMatch[1]);
          console.info(`从导航标签检测到Content总数: ${expectedTotal}`);
          break;
        }
      }

      // 方法2：从conference-search组件中查找
      if (expectedTotal === 0) {
        const searchComponent = document.querySelector('conference-search');
        if (searchComponent) {
          const countElements = searchComponent.querySelectorAll('.count');
          for (const countEl of Array.from(countElements)) {
            const countText = countEl.textContent || '';
            const match = countText.match(/\((\d+)\)/);
            if (match && countText.toLowerCase().includes('content')) {
              expectedTotal = parseInt(match[1]);
              console.info(`从搜索组件检测到Content总数: ${expectedTotal}`);
              break;
            }
          }
        }
      }

      // 方法3：从活跃标签页中提取
      if (expectedTotal === 0) {
        const activeTab = document.querySelector(
          '.active .count, [class*="active"] .count'
        );
        if (activeTab) {
          const countText = activeTab.textContent || '';
          const match = countText.match(/\((\d+)\)/);
          if (match) {
            expectedTotal = parseInt(match[1]);
            console.info(`从活跃标签检测到总数: ${expectedTotal}`);
          }
        }
      }

      // 方法4：通用标签页检测（兜底）
      if (expectedTotal === 0) {
        const contentTabs = document.querySelectorAll(
          '[role="tab"], .tab, .nav-tab, .tab-link, a[href*="content"]'
        );
        for (const tab of Array.from(contentTabs)) {
          const tabText = tab.textContent || '';
          const contentMatch = tabText.match(
            /(?:Content|Papers|Results)[^(]*\((\d+)\)/i
          );
          if (contentMatch) {
            expectedTotal = parseInt(contentMatch[1]);
            console.info(`从通用标签检测到总数: ${expectedTotal}`);
            break;
          }
        }
      }

      // 检测框架信息
      let framework: string | undefined;
      if (hasVirtualScroller) {
        framework = 'Angular CDK Virtual Scrolling';
        // 检测Angular版本
        const angularVersionMatch =
          document.documentElement.getAttribute('ng-version');
        if (angularVersionMatch) {
          framework += ` (Angular ${angularVersionMatch})`;
        }
      }

      // 获取虚拟滚动容器详细信息
      let virtualScrollerHeight = 0;
      let currentOffset = 0;
      let totalPaddingHeight = 0;

      if (hasVirtualScroller) {
        const virtualScroller = document.querySelector(
          'virtual-scroller'
        ) as HTMLElement;
        if (virtualScroller) {
          virtualScrollerHeight = virtualScroller.scrollHeight;

          // 获取当前偏移量
          const scrollableContent = virtualScroller.querySelector(
            '.scrollable-content'
          ) as HTMLElement;
          if (scrollableContent) {
            const transform = scrollableContent.style.transform;
            const translateMatch = transform.match(/translateY\(([0-9.]+)px\)/);
            if (translateMatch) {
              currentOffset = parseFloat(translateMatch[1]);
            }
          }

          // 获取总padding高度
          const totalPadding = virtualScroller.querySelector(
            '.total-padding'
          ) as HTMLElement;
          if (totalPadding) {
            totalPaddingHeight = parseFloat(totalPadding.style.height) || 0;
          }
        }
      }

      const isVirtualList =
        hasVirtualScroller || (hasTotalPadding && hasScrollableContent);

      console.info(
        `虚拟列表检测结果: isVirtualList=${isVirtualList}, expectedTotal=${expectedTotal}, framework=${framework}`
      );
      console.info(
        `虚拟滚动器信息: height=${virtualScrollerHeight}, offset=${currentOffset}, totalPadding=${totalPaddingHeight}`
      );

      return {
        isVirtualList,
        expectedTotal,
        framework,
        virtualScrollerHeight,
        // 添加额外的调试信息
        debugInfo: {
          hasVirtualScroller,
          hasTotalPadding,
          hasScrollableContent,
          currentOffset,
          totalPaddingHeight,
        },
      };
    });
  }

  /**
   * 等待虚拟列表DOM稳定 - 针对FAccT网站优化
   */
  private async waitForVirtualListStable(page: Page): Promise<void> {
    let previousItemCount = 0;
    let previousOffset = 0;
    let previousScrollTop = 0;
    let stableCount = 0;
    const maxWait = 8; // 增加等待次数

    for (let i = 0; i < maxWait; i++) {
      await new Promise((resolve) => setTimeout(resolve, 400)); // 增加等待时间到400ms

      const domState = await page.evaluate(() => {
        // 针对FAccT网站的精确DOM检测
        const contentCards = document.querySelectorAll(
          'content-card.search-item, content-card'
        );
        const itemCount = contentCards.length;

        // 检测虚拟滚动偏移
        let currentOffset = 0;
        const scrollableContent = document.querySelector(
          '.scrollable-content'
        ) as HTMLElement;
        if (scrollableContent) {
          const transform = scrollableContent.style.transform;
          const translateMatch = transform.match(/translateY\(([0-9.]+)px\)/);
          if (translateMatch) {
            currentOffset = parseFloat(translateMatch[1]);
          }
        }

        // 检测虚拟滚动器状态
        let scrollTop = 0;
        const virtualScroller = document.querySelector(
          'virtual-scroller'
        ) as HTMLElement;
        if (virtualScroller) {
          scrollTop = virtualScroller.scrollTop;
        }

        // 检测是否有加载指示器
        const hasLoadingIndicator = !!(
          document.querySelector(
            '.loading, .spinner, [class*="loading"], [class*="spinner"]'
          ) || document.querySelector('[aria-busy="true"]')
        );

        return {
          itemCount,
          currentOffset,
          scrollTop,
          hasLoadingIndicator,
        };
      });

      // 增强的稳定性检查
      const isItemCountStable =
        domState.itemCount === previousItemCount && domState.itemCount > 0;
      const isOffsetStable =
        Math.abs(domState.currentOffset - previousOffset) < 2; // 允许2px偏差
      const isScrollTopStable =
        Math.abs(domState.scrollTop - previousScrollTop) < 10; // 允许10px偏差
      const isNotLoading = !domState.hasLoadingIndicator;

      if (
        isItemCountStable &&
        (isOffsetStable || isScrollTopStable) &&
        isNotLoading
      ) {
        stableCount++;
        if (stableCount >= 2) {
          // 连续两次稳定
          logger.info(
            `✅ DOM已稳定: ${domState.itemCount}个项目, 偏移${domState.currentOffset}px, scrollTop${domState.scrollTop}px`
          );
          break;
        }
      } else {
        stableCount = 0;
        logger.info(
          `⏳ 等待DOM稳定[${i + 1}/${maxWait}]: ${
            domState.itemCount
          }个项目 (前次${previousItemCount}), 偏移${
            domState.currentOffset
          }px (前次${previousOffset}px), scrollTop${
            domState.scrollTop
          }px, 加载中${domState.hasLoadingIndicator}`
        );
      }

      previousItemCount = domState.itemCount;
      previousOffset = domState.currentOffset;
      previousScrollTop = domState.scrollTop;
    }

    if (stableCount < 2) {
      logger.warn('⚠️ DOM稳定检测超时，继续执行');
    }
  }

  /**
   * 多策略提取虚拟列表项目 - 针对FAccT网站结构优化
   */
  private async extractVirtualListItems(page: Page): Promise<any[]> {
    return await page.evaluate(() => {
      const items: any[] = [];

      // 针对FAccT/SIGCHI网站的精确选择器策略
      const itemSelectors = [
        'content-card.search-item', // FAccT 2025主要结构
        'content-card',
        '[class*="search-item"]',
        '[class*="card"]',
        '[class*="content-card"]',
        'article',
        '[role="article"]',
        '.result-item',
        '.paper-item',
      ];

      let selectedElements: NodeListOf<Element> | null = null;
      let usedSelector = '';

      // 找到最有效的选择器，优先使用最精确的
      for (const selector of itemSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          // 验证元素是否包含论文信息
          const firstElement = elements[0];
          const hasTitle = firstElement.querySelector(
            '.card-data-name .name, program-card-name .name, h3, h4, h5, .title, [class*="title"]'
          );
          const hasLink = firstElement.querySelector(
            'a.link-block.card-container, a[href*="content"], a[href*="program"]'
          );
          const hasPersonList = firstElement.querySelector('person-list');

          if ((hasTitle || hasLink) && elements.length >= 3) {
            selectedElements = elements;
            usedSelector = selector;
            break;
          }
        }
      }

      if (!selectedElements) {
        console.warn('未找到有效的列表项目元素');
        return [];
      }

      console.info(
        `使用选择器: ${usedSelector}, 找到 ${selectedElements.length} 个元素`
      );

      Array.from(selectedElements).forEach((element, index) => {
        try {
          // 针对FAccT网站的精确标题提取
          let title = '';
          const titleSelectors = [
            '.card-data-name .name', // FAccT 2025主要标题结构
            'program-card-name .name',
            '.name',
            'h3 .name',
            'a.link-block.card-container[aria-label]', // 从aria-label提取
            'h3 a',
            'h4 a',
            'h5 a',
            'h3',
            'h4',
            'h5',
            '.title',
            '.paper-title',
            '.content-title',
            'strong',
            'b',
          ];

          for (const selector of titleSelectors) {
            const titleEl = element.querySelector(selector);
            if (titleEl?.textContent?.trim()) {
              let candidateTitle = titleEl.textContent.trim();

              // 如果是从aria-label提取，需要清理后缀
              if (selector.includes('aria-label')) {
                candidateTitle = candidateTitle.replace(
                  /\s+clickable Content card$/,
                  ''
                );
              }

              candidateTitle = candidateTitle.replace(/\s+/g, ' ');

              if (
                candidateTitle.length > 8 &&
                !candidateTitle.match(/^\d+$/) &&
                !candidateTitle.toLowerCase().includes('tutorial') &&
                !candidateTitle.toLowerCase().includes('papers') &&
                !candidateTitle.toLowerCase().includes('sessions')
              ) {
                title = candidateTitle;
                break;
              }
            }
          }

          // 针对FAccT网站的精确作者提取
          let authors: string[] = [];
          const authorSelectors = [
            'person-list a[person-link]', // FAccT 2025主要作者结构
            'person-list .people-container a',
            'person-list',
            '.people-container a',
            '.author-list a',
            '.authors a',
            '.author a',
            '.people-container',
            '.author-list',
            '.authors',
            '.author',
            '.byline',
            '.credits',
            'small a',
            '.text-muted a',
            '.secondary-text a',
            'small',
            '.text-muted',
            '.secondary-text',
          ];

          for (const selector of authorSelectors) {
            if (selector.includes('a[person-link]') || selector.includes('a')) {
              // 直接提取链接中的作者名
              const authorLinks = element.querySelectorAll(selector);
              if (authorLinks.length > 0) {
                authors = Array.from(authorLinks)
                  .map((link) => link.textContent?.trim())
                  .filter(
                    (name) => name && name.length > 1 && !name.match(/^\d+$/)
                  ) as string[];
                if (authors.length > 0) break;
              }
            } else {
              // 从文本中提取作者
              const authorsEl = element.querySelector(selector);
              if (authorsEl?.textContent?.trim()) {
                const authorsText = authorsEl.textContent.trim();
                // 清理和分割作者
                const cleanAuthorsText = authorsText
                  .replace(/\s+/g, ' ')
                  .trim();
                if (cleanAuthorsText && cleanAuthorsText.length > 2) {
                  authors = cleanAuthorsText
                    .split(/[,;]|\s*,\s+/)
                    .map((a) => a.trim())
                    .filter((a) => a.length > 1 && !a.match(/^\d+$/));
                  if (authors.length > 0) break;
                }
              }
            }
          }

          // 针对FAccT网站的精确链接提取
          let detailUrl = '';
          const linkSelectors = [
            'a.link-block.card-container[href*="content"]', // FAccT 2025主要链接结构
            'a.link-block.card-container[href*="program"]',
            'a[href*="/facct/2025/program/content/"]',
            'a[href*="content"]',
            'a[href*="program"]',
            'a[href*="paper"]',
            '.link-block[href]',
            'h3 a',
            'h4 a',
            'h5 a',
            'a[href]:first-of-type',
          ];

          for (const selector of linkSelectors) {
            const linkEl = element.querySelector(selector) as HTMLAnchorElement;
            if (linkEl?.href) {
              // 确保是完整的URL
              if (linkEl.href.startsWith('http')) {
                detailUrl = linkEl.href;
              } else if (linkEl.href.startsWith('/')) {
                detailUrl = window.location.origin + linkEl.href;
              }
              if (detailUrl) break;
            }
          }

          // 从URL中提取内容ID作为更精确的唯一标识符
          let contentId = '';
          if (detailUrl) {
            const idMatch = detailUrl.match(/\/content\/(\d+)/);
            if (idMatch) {
              contentId = idMatch[1];
            }
          }

          // 生成更精确的唯一标识符系统
          const uniqueIdentifiers = [
            contentId ? `content-${contentId}` : '',
            detailUrl,
            title
              ? `title-${title.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '-')}`
              : '',
            authors.length > 0
              ? `author-${authors[0].replace(/[^a-zA-Z0-9]/g, '-')}`
              : '',
            `element-${index}`,
          ].filter((id) => id && id.length > 3);

          const primaryId = uniqueIdentifiers[0] || `item-${index}`;

          // 提取论文类型信息
          let paperType = '';
          const typeEl = element.querySelector(
            '.content-type-block .type-name'
          );
          if (typeEl?.textContent?.trim()) {
            paperType = typeEl.textContent.trim();
          }

          // 检查是否有在线演示标志
          const hasVirtualLabel = !!element.querySelector('virtual-label');

          if (title || detailUrl || contentId) {
            items.push({
              title: title || '未知标题',
              authors: authors,
              detailUrl: detailUrl,
              contentId: contentId,
              paperType: paperType,
              isVirtualPresentation: hasVirtualLabel,
              uniqueId: primaryId,
              alternativeIds: uniqueIdentifiers.slice(1),
              domIndex: index,
              elementSelector: usedSelector,
              extractedAt: Date.now(),
              // 调试信息
              debugInfo: {
                hasTitle: !!title,
                hasAuthors: authors.length > 0,
                hasDetailUrl: !!detailUrl,
                hasContentId: !!contentId,
                titleLength: title.length,
                authorsCount: authors.length,
              },
            });
          }
        } catch (error) {
          console.warn(`提取第${index}项时出错:`, error);
        }
      });

      return items;
    });
  }

  /**
   * 分析收集的项目，检测新项目和重复项目
   */
  private analyzeCollectedItems(
    currentItems: any[],
    collectedItems: Map<string, any>
  ): {
    newItems: any[];
    duplicates: number;
  } {
    const newItems: any[] = [];
    let duplicates = 0;

    for (const item of currentItems) {
      let isNew = true;

      // 检查主要唯一标识符
      if (collectedItems.has(item.uniqueId)) {
        isNew = false;
        duplicates++;
      } else {
        // 检查替代标识符
        for (const altId of item.alternativeIds || []) {
          if (collectedItems.has(altId)) {
            isNew = false;
            duplicates++;
            break;
          }
        }

        // 检查是否已存在类似项目（基于标题相似度）
        if (isNew && item.title) {
          for (const [, existingItem] of collectedItems) {
            if (
              this.calculateTitleSimilarity(item.title, existingItem.title) >
              0.85
            ) {
              isNew = false;
              duplicates++;
              break;
            }
          }
        }
      }

      if (isNew) {
        newItems.push(item);
      }
    }

    return { newItems, duplicates };
  }

  /**
   * 计算标题相似度
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    if (!title1 || !title2) return 0;

    const normalize = (str: string) =>
      str
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const norm1 = normalize(title1);
    const norm2 = normalize(title2);

    if (norm1 === norm2) return 1;

    // 简单的Jaccard相似度
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));
    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * 计算自适应延迟时间
   */
  private calculateAdaptiveDelay(
    baseDelay: number,
    context: {
      consecutiveNoNewItems: number;
      stagnationCount: number;
      progressRatio: number;
    }
  ): number {
    let delay = baseDelay;

    // 根据连续无新项目情况调整
    if (context.consecutiveNoNewItems > 0) {
      delay += context.consecutiveNoNewItems * 500; // 每次无新项目增加0.5秒
    }

    // 根据停滞情况调整
    if (context.stagnationCount > 0) {
      delay += context.stagnationCount * 800; // 每次停滞增加0.8秒
    }

    // 根据进度调整
    if (context.progressRatio > 0.8) {
      delay += 1000; // 接近完成时增加等待时间
    }

    // 限制延迟范围
    return Math.min(Math.max(delay, 1000), 8000); // 1-8秒之间
  }

  /**
   * 输出虚拟列表收集统计信息
   */
  private logVirtualListCollectionStats(
    collectedItems: Map<string, any>,
    expectedTotal: number,
    scrollCount: number
  ): void {
    const totalCollected = collectedItems.size;
    const completionRate = Math.round((totalCollected / expectedTotal) * 100);

    logger.info('\n📈 Browser-Use 虚拟列表收集统计:');
    logger.info(
      `   总收集数量: ${totalCollected}/${expectedTotal} (${completionRate}%)`
    );
    logger.info(`   滚动次数: ${scrollCount}`);
    logger.info(
      `   平均效率: ${Math.round(totalCollected / scrollCount)} 项/次滚动`
    );

    // 按时间段分析收集效率
    const timeSlots = new Map<number, number>();
    for (const [, item] of collectedItems) {
      const slot = Math.floor(item.scrollIteration / 10) * 10;
      timeSlots.set(slot, (timeSlots.get(slot) || 0) + 1);
    }

    if (timeSlots.size > 1) {
      logger.info('   收集效率分布:');
      for (const [slot, count] of timeSlots) {
        logger.info(`     第${slot + 1}-${slot + 10}次滚动: ${count}项`);
      }
    }
  }
}

/**
 * 创建 Browser-Use 代理实例
 */
export function createBrowserUseAgent(config: AIConfig): BrowserUseAgent {
  return new BrowserUseAgent(config);
}
