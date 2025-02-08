import { test, expect, Page } from '@playwright/test';

// 全局常量
const BASE_URL = 'http://127.0.0.1:18080';
const SEED_ID = 'S1180_03';
const SEED_ID2 = 'S2033_01';

// 登录相关函数
async function getCSRFToken(page: Page): Promise<string> {
  return await page.$eval('input[name="csrfmiddlewaretoken"]', (el: HTMLInputElement) => el.value);
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/cprweb/accounts/login/`);
  await page.waitForSelector('#id_username', { timeout: 10000 });
  
  // 填写登录表单并提交
  await page.fill('#id_username', 'wangjun');
  await page.fill('#id_password', '123456');
  
  // 提交登录表单并等待页面跳转
  await Promise.all([
    page.waitForNavigation({ timeout: 180000 }),
    page.click('button[type="submit"]')
  ]);
}

test.describe('申请种子功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('访问申请种子页面', async ({ page }) => {
    // 访问申请种子页面
    await page.goto(`${BASE_URL}/cprweb/oa/supply-request/create/`);
    
    // 验证页面标题
    await expect(page.locator('h2')).toHaveText('申请种子');
  });

  test('提交完整申请表单', async ({ page }) => {
    // 访问申请种子页面
    await page.goto(`${BASE_URL}/cprweb/oa/supply-request/create/`);
    
    // 填写申请用途
    await page.fill('textarea[name="purpose"]', '用于实验室研究');

    // 选择第一个种子
    // 点击选择框触发下拉
    await page.click('.select2-selection');
    // 等待下拉框完全展开
    await page.waitForSelector('.select2-dropdown', { state: 'visible' });
    // 在下拉框的输入框中输入种子编号
    await page.fill('.select2-search__field', SEED_ID);
    // 等待搜索结果出现
    await page.waitForSelector('.select2-results__option', { state: 'visible' });
    // 点击第一个匹配的结果
    await page.click('.select2-results__option:first-child');
    // 等待选择完成
    await page.waitForSelector(`.select2-selection__rendered:has-text("${SEED_ID}")`, { 
      state: 'visible',
      timeout: 10000
    });

    // 填写第一个种子的数量
    await page.fill('input[name="items-0-quantity"]', '10');
    // 等待数量输入完成
    await page.waitForTimeout(2000);

    // 点击"添加种子"按钮
    await page.click('text="添加种子"');
    await page.waitForTimeout(1000); // 等待新行添加完成

    // 选择第二个种子
    // 点击第二行的选择框
    await page.click('select[name="form-1-mutant_supply"] + .select2-container .select2-selection');
    // 等待下拉框完全展开
    await page.waitForSelector('.select2-dropdown', { state: 'visible' });
    // 在下拉框的输入框中输入第二个种子编号
    await page.fill('.select2-search__field', SEED_ID2);
    // 等待搜索结果出现
    await page.waitForSelector('.select2-results__option', { state: 'visible' });
    // 点击第一个匹配的结果
    await page.click('.select2-results__option:first-child');
    // 等待选择完成
    await page.waitForSelector(`.select2-selection__rendered:has-text("${SEED_ID2}")`, { 
      state: 'visible',
      timeout: 10000
    });

    // 填写第二个种子的数量
    await page.fill('input[name="form-1-quantity"]', '5');
    await page.waitForTimeout(2000);

    // 提交表单并等待跳转
    await Promise.all([
      page.waitForNavigation({ url: `${BASE_URL}/cprweb/oa/supply-requests/` }),
      page.click('button[type="submit"]')
    ]);
    
    // 验证跳转后的URL
    await expect(page).toHaveURL(`${BASE_URL}/cprweb/oa/supply-requests/`);
  });

  test('验证表单错误提示', async ({ page }) => {
    // 访问申请种子页面
    await page.goto(`${BASE_URL}/cprweb/oa/supply-request/create/`);
    
    // 直接提交空表单
    await page.click('button[type="submit"]');

    // 验证错误提示
    await expect(page.locator('.error-message').first()).toContainText('请输入申请用途');
    await expect(page.locator('.has-error').first()).toBeVisible();
  });
});
