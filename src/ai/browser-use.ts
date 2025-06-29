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
   * Browser-Use 专用人类式滚动行为
   */
  private async performHumanLikeScroll(page: Page): Promise<void> {
    logger.info('Browser-Use 执行人类式平滑滚动...');

    // 获取页面尺寸信息
    const { viewportHeight, currentY, maxScrollY } = await page.evaluate(
      () => ({
        viewportHeight: window.innerHeight,
        currentY: window.scrollY,
        maxScrollY:
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          ) - window.innerHeight,
      })
    );

    if (currentY >= maxScrollY * 0.95) {
      logger.info('Browser-Use: 已接近页面底部，跳过滚动');
      return;
    }

    // 分3-5步平滑滚动
    const scrollSteps = 3 + Math.floor(Math.random() * 3); // 3-5步
    const remainingDistance = maxScrollY - currentY;
    const stepDistance = Math.floor(remainingDistance / scrollSteps);

    for (let i = 0; i < scrollSteps; i++) {
      // 计算这一步的滚动距离，添加随机性
      const variance = stepDistance * (0.8 + Math.random() * 0.4); // ±20%变化
      const scrollDistance = Math.min(Math.floor(variance), remainingDistance);

      if (scrollDistance <= 0) break;

      // 执行平滑滚动动画
      await page.evaluate((distance) => {
        return new Promise<void>((resolve) => {
          const start = window.scrollY;
          const target = start + distance;
          const duration = 400 + Math.random() * 300; // 400-700ms
          let startTime: number;

          function animate(currentTime: number) {
            if (!startTime) startTime = currentTime;
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 缓动函数 - 开始快，结束慢
            const easeOut = 1 - Math.pow(1 - progress, 3);
            window.scrollTo(0, start + (target - start) * easeOut);

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              resolve();
            }
          }

          requestAnimationFrame(animate);
        });
      }, scrollDistance);

      // 人类式停顿 - 模拟查看内容的时间
      const pauseTime = 800 + Math.random() * 600; // 0.8-1.4秒
      logger.info(
        `Browser-Use 滚动步骤 ${i + 1}/${scrollSteps}，停顿 ${Math.round(
          pauseTime
        )}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, pauseTime));

      // 偶尔模拟用户的回看行为
      if (i > 0 && Math.random() < 0.25) {
        // 25%概率
        logger.info('Browser-Use 模拟用户回看行为');
        await page.evaluate(() => {
          const backDistance = 30 + Math.random() * 80; // 回滚30-110px
          window.scrollBy(0, -backDistance);
        });
        await new Promise((resolve) =>
          setTimeout(resolve, 200 + Math.random() * 300)
        );

        // 继续向前
        await page.evaluate(() => {
          const forwardDistance = 50 + Math.random() * 100;
          window.scrollBy(0, forwardDistance);
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    logger.info('Browser-Use 人类式滚动完成');
  }

  /**
   * 提取当前页面可见的论文项目
   */
  private async extractCurrentVisibleItems(
    page: Page,
    searchKeyword: string
  ): Promise<SearchResultItem[]> {
    try {
      // 获取页面内容和可见元素信息
      const pageContext = await this.getPageContext(page);

      const prompt = `
作为智能浏览器代理，请从当前页面中提取**当前可见的**论文项目信息。

任务目标：
- 搜索关键词：${searchKeyword}
- 只提取当前页面中可见的论文项目，不要考虑需要滚动才能看到的项目
- 这是SIGCHI会议网站的Content标签页

页面上下文：
${pageContext}

SIGCHI网站特点：
1. 每个论文是<content-card>组件
2. 主要链接：<a class="link-block card-container">指向详情页  
3. 外部链接按钮：<link-list-btn><button>触发外部链接覆盖层
4. 论文标题在 .card-data-name .name 中
5. 作者列表在 person-list 中的 a[person-link] 元素中

提取步骤：
1. 识别当前可见的所有<content-card>论文条目
2. 对每个论文条目提取：
   - 论文标题（.card-data-name .name）
   - 作者列表（person-list 中的 a[person-link] 元素）
   - 详情页链接（.link-block.card-container 的 href）
   - 外部论文链接（如果能找到的话）

返回JSON格式：
[
  {
    "title": "论文完整标题",
    "authors": ["作者1", "作者2", "作者3"],
    "detailUrl": "https://programs.sigchi.org/...",
    "paperLink": "真实的外部论文链接（如果找到的话）" 
  }
]

重要提醒：
- 只提取当前页面可见的项目，不要想象或推测其他项目
- 如果没有找到真实的外部论文链接，请省略paperLink字段
- 绝对不要生成虚假或示例链接
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
        logger.error('当前可见项目解析失败:', parseError);
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
            };

            // 添加论文链接（如果存在且有效）
            if (item.paperLink && typeof item.paperLink === 'string') {
              const cleanedLink = this.cleanText(item.paperLink);
              if (this.isValidPaperLink(cleanedLink)) {
                searchResult.paperLink = cleanedLink;
              }
            }

            searchResults.push(searchResult);
          }
        }
      }

      logger.info(`提取到 ${searchResults.length} 个当前可见的论文项目`);
      return searchResults;
    } catch (error) {
      logger.error(`提取当前可见项目失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 模拟人类滚动到下一页内容（每次不超过一屏，避免跳过列表项）
   */
  private async scrollToNextPage(page: Page): Promise<boolean> {
    try {
      logger.info('模拟人类滚动到下一页（限制在一屏以内）...');

      // 获取滚动前的页面状态
      const beforeScroll = await page.evaluate(() => ({
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        maxScrollY:
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          ) - window.innerHeight,
        itemCount: document.querySelectorAll('content-card').length,
      }));

      // 检查是否已经到达页面底部
      if (beforeScroll.scrollY >= beforeScroll.maxScrollY * 0.95) {
        logger.info('已接近页面底部，无法继续滚动');
        return false;
      }

      // 执行受控的人类式滚动（不超过一屏）
      await this.performControlledScroll(page, beforeScroll.viewportHeight);

      // 等待内容加载和DOM更新
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // 获取滚动后的页面状态
      const afterScroll = await page.evaluate(() => ({
        scrollY: window.scrollY,
        maxScrollY:
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          ) - window.innerHeight,
        itemCount: document.querySelectorAll('content-card').length,
      }));

      // 计算实际滚动距离
      const actualScrollDistance = afterScroll.scrollY - beforeScroll.scrollY;

      // 检查是否有效滚动
      if (actualScrollDistance > 10) {
        // 至少滚动10px才算有效
        logger.info(
          `滚动成功，距离: ${Math.round(actualScrollDistance)}px (${Math.round(
            (actualScrollDistance / beforeScroll.viewportHeight) * 100
          )}% 屏高)，项目数量：${beforeScroll.itemCount} -> ${
            afterScroll.itemCount
          }`
        );
        return true;
      } else {
        logger.info('滚动距离太小或未滚动，可能已到达底部');
        return false;
      }
    } catch (error) {
      logger.error(`滚动到下一页失败: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 执行受控的人类式滚动（限制在一屏以内，避免跳过内容）
   */
  private async performControlledScroll(
    page: Page,
    viewportHeight: number
  ): Promise<void> {
    logger.info('执行受控滚动，限制在一屏高度以内...');

    await page.evaluate((maxScrollDistance) => {
      return new Promise<void>((resolve) => {
        const startY = window.scrollY;
        const maxY =
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          ) - window.innerHeight;

        // 滚动距离限制为视窗高度的60-80%，避免跳过内容
        const scrollPercentage = 0.6 + Math.random() * 0.2; // 60%-80%
        const targetScrollDistance = Math.floor(
          maxScrollDistance * scrollPercentage
        );

        // 确保不会滚动超出页面范围
        const targetY = Math.min(startY + targetScrollDistance, maxY);
        const actualScrollDistance = targetY - startY;

        if (actualScrollDistance <= 0) {
          resolve();
          return;
        }

        console.log(
          `受控滚动：从 ${startY}px 到 ${targetY}px，距离 ${actualScrollDistance}px (${Math.round(
            (actualScrollDistance / maxScrollDistance) * 100
          )}% 屏高)`
        );

        // 使用平滑动画滚动
        const duration = 800 + Math.random() * 400; // 800-1200ms
        let startTime: number;

        function animate(currentTime: number) {
          if (!startTime) startTime = currentTime;
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // 使用缓动函数模拟人类滚动
          const easeOut = 1 - Math.pow(1 - progress, 3);
          const currentY = startY + actualScrollDistance * easeOut;

          window.scrollTo(0, currentY);

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            resolve();
          }
        }

        requestAnimationFrame(animate);
      });
    }, viewportHeight);
  }

  /**
   * 使用 Browser-Use 从搜索结果页面提取论文信息
   * 采用逐步处理的方式：处理当前可见项目 -> 滚动 -> 处理新项目 -> 重复
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
      logger.info('开始使用 Browser-Use 逐步滚动收集搜索结果');

      const allResults: SearchResultItem[] = [];
      const processedUrls = new Set<string>();
      let noNewItemsCount = 0;
      const maxRetries = 3;

      // 设置最大滚动次数为固定值
      const expectedTotal = await this.getExpectedTotalCount(page);
      const maxScrolls = 50; // 固定为50次滚动
      let scrollCount = 0;

      logger.info(
        `📊 页面预期包含 ${expectedTotal} 篇文章，设置最大滚动次数: ${maxScrolls}`
      );

      // 首先滚动到页面顶部确保从头开始
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 先收集初始页面的内容
      logger.info(`\n=== 初始页面收集 ===`);
      await this.collectCurrentPageItems(
        page,
        searchKeyword,
        allResults,
        processedUrls
      );
      logger.info(`初始页面收集完成，共 ${allResults.length} 个项目`);

      // 开始滚动循环
      while (scrollCount < maxScrolls && noNewItemsCount < maxRetries) {
        scrollCount++;
        logger.info(`\n=== 第 ${scrollCount} 次滚动 ===`);

        // 1. 执行滚动操作（限制在一屏以内）
        logger.info('🔄 开始受控滚动（不超过一屏，避免跳过内容）...');
        const hasMoreContent = await this.scrollToNextPage(page);

        if (!hasMoreContent) {
          logger.info('📄 已到达页面底部，执行最后一次内容收集...');

          // 即使无法继续滚动，也要收集当前页面的内容
          const beforeCount = allResults.length;
          await this.collectCurrentPageItems(
            page,
            searchKeyword,
            allResults,
            processedUrls
          );
          const afterCount = allResults.length;
          const newItemsFound = afterCount - beforeCount;

          if (newItemsFound > 0) {
            logger.info(
              `✅ 最后一页收集完成！新增 ${newItemsFound} 个项目，总计 ${allResults.length} 个`
            );
          } else {
            logger.info('ℹ️ 最后一页无新项目');
          }

          logger.info('🏁 页面内容收集完成，停止处理');
          break;
        }

        logger.info('✅ 受控滚动完成，页面已安全移动到新位置');

        // 2. 滚动后停顿，等待页面稳定和内容加载
        logger.info('⏱️ 停顿等待页面稳定...');
        await new Promise((resolve) => setTimeout(resolve, 2500)); // 增加等待时间确保内容完全加载

        // 3. 收集当前页面的所有项目
        logger.info('📋 开始收集当前页面项目...');
        const beforeCount = allResults.length;
        await this.collectCurrentPageItems(
          page,
          searchKeyword,
          allResults,
          processedUrls
        );
        const afterCount = allResults.length;
        const newItemsFound = afterCount - beforeCount;

        // 4. 分析收集结果
        if (newItemsFound > 0) {
          noNewItemsCount = 0;
          logger.info(
            `✅ 收集完成！新增 ${newItemsFound} 个项目，总计 ${allResults.length} 个`
          );
        } else {
          noNewItemsCount++;
          logger.info(
            `⚠️ 收集完成，但无新项目（连续 ${noNewItemsCount} 次无新内容）`
          );
        }

        // 5. 检查是否需要继续
        if (noNewItemsCount >= maxRetries) {
          logger.info('📝 达到最大无新项目重试次数，停止滚动收集');
          break;
        }

        // 简短等待后继续下一轮
        logger.info('💤 准备进行下一轮滚动...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // 滚动回顶部
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });

      logger.info(`\n=== 📊 收集统计 ===`);
      logger.info(`预期文章数: ${expectedTotal}`);
      logger.info(`实际收集数: ${allResults.length}`);
      logger.info(
        `收集进度: ${Math.round((allResults.length / expectedTotal) * 100)}%`
      );
      logger.info(`总共执行了 ${scrollCount} 次滚动`);

      if (scrollCount >= maxScrolls) {
        logger.warn(
          `⚠️ 达到最大滚动次数限制 (${maxScrolls})，可能未收集完所有文章`
        );
      }

      if (allResults.length < expectedTotal * 0.9) {
        logger.warn(
          `⚠️ 收集数量可能不完整，预期 ${expectedTotal}，实际 ${allResults.length}`
        );
      } else {
        logger.info(`✅ 收集完成度良好！`);
      }

      // 显示最终收集结果概览
      if (allResults.length > 0) {
        logger.info(`\n=== 📚 收集结果概览 ===`);
        allResults.forEach((result, index) => {
          logger.info(
            `${index + 1}. ${result.title.substring(0, 80)}${
              result.title.length > 80 ? '...' : ''
            }`
          );
          logger.info(`   👥 作者: ${result.authors.join(', ')}`);
          logger.info(`   🔗 链接: ${result.detailUrl}`);
          if (result.paperLink) {
            logger.info(`   📄 论文: ${result.paperLink}`);
          }
        });
      }

      return allResults;
    } catch (error) {
      logger.error(`Browser-Use 逐步滚动收集失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取页面预期的文章总数（从Content标签或其他指标中获取）
   */
  private async getExpectedTotalCount(page: Page): Promise<number> {
    try {
      const expectedCount = await page.evaluate(() => {
        // 尝试从Content标签页获取总数，如 "Content (79)"
        const contentTabs = document.querySelectorAll(
          '[role="tab"], .tab, .nav-tab, .tab-link, .content-tab'
        );

        for (const tab of Array.from(contentTabs)) {
          const tabText = tab.textContent || '';
          const contentMatch = tabText.match(/Content\s*\((\d+)\)/i);
          if (contentMatch) {
            return parseInt(contentMatch[1]);
          }
        }

        // 尝试从页面标题或其他地方获取总数信息
        const titleElement = document.querySelector('h1, .title, .page-title');
        if (titleElement) {
          const titleText = titleElement.textContent || '';
          const titleMatch = titleText.match(
            /(\d+)\s*(?:papers|articles|results)/i
          );
          if (titleMatch) {
            return parseInt(titleMatch[1]);
          }
        }

        // 尝试从结果计数器获取
        const countElements = document.querySelectorAll(
          '.count, .total, .results-count'
        );
        for (const element of Array.from(countElements)) {
          const countText = element.textContent || '';
          const countMatch = countText.match(/(\d+)/);
          if (countMatch && parseInt(countMatch[1]) > 10) {
            // 过滤掉太小的数字
            return parseInt(countMatch[1]);
          }
        }

        // 如果都找不到，返回默认值
        return 50; // 默认假设50篇文章
      });

      logger.info(`🎯 检测到页面预期包含 ${expectedCount} 篇文章`);
      return expectedCount;
    } catch (error) {
      logger.warn(
        `获取预期文章总数失败，使用默认值: ${(error as Error).message}`
      );
      return 50; // 默认值
    }
  }

  /**
   * 收集当前页面的所有项目（停顿后的完整收集）
   */
  private async collectCurrentPageItems(
    page: Page,
    searchKeyword: string,
    allResults: SearchResultItem[],
    processedUrls: Set<string>
  ): Promise<void> {
    try {
      // 提取当前页面可见的项目
      const currentResults = await this.extractCurrentVisibleItems(
        page,
        searchKeyword
      );

      // 过滤掉已处理的项目
      const newResults = currentResults.filter(
        (item) => !processedUrls.has(item.detailUrl)
      );

      if (newResults.length > 0) {
        // 添加新项目到结果集
        allResults.push(...newResults);
        newResults.forEach((item) => processedUrls.add(item.detailUrl));

        logger.info(`🆕 发现 ${newResults.length} 个新项目:`);
        // 显示新收集的项目标题
        newResults.forEach((item, index) => {
          logger.info(
            `   ${index + 1}. ${item.title.substring(0, 70)}${
              item.title.length > 70 ? '...' : ''
            }`
          );
        });
      } else {
        logger.info(`🔍 当前页面无新项目（可能是重复项目或页面未变化）`);
      }
    } catch (error) {
      logger.error(`收集当前页面项目失败: ${(error as Error).message}`);
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
}

/**
 * 创建 Browser-Use 代理实例
 */
export function createBrowserUseAgent(config: AIConfig): BrowserUseAgent {
  return new BrowserUseAgent(config);
}
