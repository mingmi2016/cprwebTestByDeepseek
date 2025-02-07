import { test, expect } from '@playwright/test';

// 简单的测试，主要测试一些页面是否可以正常打开，需要做一些优化
// 填写登录表单
const BASE_URL = 'http://127.0.0.1:18080';

async function getCsrfToken(page: Page): Promise<string> {
    return await page.$eval('input[name="csrfmiddlewaretoken"]', (el: HTMLInputElement) => el.value);
}

async function login(page: Page, username: string, password: string): Promise<void> {
    await page.fill('#id_username', username);
    await page.fill('#id_password', password);
    await Promise.all([
        page.waitForNavigation({ timeout: 180000 }),
        page.click('button[type="submit"]')
    ]);
}

test.describe('CPRWebTest', () => {
    test('成功登录用例', async ({ page }) => {
        await page.goto(`${BASE_URL}/cprweb/accounts/login/`);
        console.log('Page title:', await page.title());
        await page.waitForSelector('#id_username', { timeout: 10000 });
        
        // 填写登录表单
        // 获取CSRF token
        const csrfToken = await getCsrfToken(page);
        
        // 填写登录表单并提交
        await login(page, 'wangjun', '123456');
        
        // 验证跳转后的URL
        await expect(page).toHaveURL(/cprweb\/ccge/, { timeout: 180000 });
        
        // 等待页面加载完成
        await page.waitForLoadState('networkidle', { timeout: 180000 });
        
        // 验证页面标题
        await expect(page.locator('div > p').first()).toContainText('Welcome to the CRISPR/CAS gene editing web service', { timeout: 180000 });
    });

    test('错误密码登录用例', async ({ page }) => {
        await page.goto(`${BASE_URL}/cprweb/accounts/login/`);
        await page.waitForSelector('#id_username', { timeout: 60000 });
        
        await page.fill('#id_username', 'testuser');
        await page.fill('#id_password', 'wrongpass');
        await page.click('button[type="submit"]');
        
        await expect(page.locator('.alert-danger')).toContainText('Your username and password didn\'t match. Please try again.', { timeout: 120000 });
    });

    test('审批历史页面用例', async ({ page }) => {
        // 先登录
        await page.goto(`${BASE_URL}/cprweb/accounts/login/`);
        await page.waitForSelector('#id_username', { timeout: 10000 });
        
        // 获取CSRF token
        const csrfToken = await getCsrfToken(page);
        
        // 填写登录表单并提交
        await login(page, 'wangjun', '123456');
        
        // 访问审批历史页面
        await page.goto(`${BASE_URL}/cprweb/oa/approval-history/`);
        
        // 验证页面包含<h2>审批历史</h2>标题
        await expect(page.locator('h2')).toHaveText('审批历史');
        
        // 验证重发邮件按钮存在
        const resendButton = page.locator('button.btn-resend').first();
        await expect(resendButton).toBeVisible();
        await expect(resendButton).toHaveText('重发邮件');
    });

    test('申请种子页面用例', async ({ page }) => {
        // 先登录
        await page.goto(`${BASE_URL}/cprweb/accounts/login/`);
        await page.waitForSelector('#id_username', { timeout: 10000 });
        
        // 获取CSRF token
        const csrfToken = await getCsrfToken(page);
        
        // 填写登录表单并提交
        await login(page, 'wangjun', '123456');
        
        // 访问申请种子页面
        await page.goto(`${BASE_URL}/cprweb/oa/supply-request/create/`);
        
        // 验证页面包含<h2>申请种子</h2>标题
        await expect(page.locator('h2')).toHaveText('申请种子');
    });

    test('申请列表页面用例', async ({ page }) => {
        // 先登录
        await page.goto(`${BASE_URL}/cprweb/accounts/login/`);
        await page.waitForSelector('#id_username', { timeout: 10000 });
        
        // 获取CSRF token
        const csrfToken = await getCsrfToken(page);
        
        // 填写登录表单并提交
        await login(page, 'wangjun', '123456');
        
        // 访问申请列表页面
        await page.goto(`${BASE_URL}/cprweb/oa/supply-requests/`);
        
        // 验证页面包含<h2>申请列表</h2>标题
        await expect(page.locator('h2')).toHaveText('申请列表');
        await expect(page.locator('h2')).toHaveCSS('margin-bottom', '20px');
    });

    test('待审批请求页面用例', async ({ page }) => {
        // 先登录
        await page.goto(`${BASE_URL}/cprweb/accounts/login/`);
        await page.waitForSelector('#id_username', { timeout: 10000 });
        
        // 获取CSRF token
        const csrfToken = await getCsrfToken(page);
        
        // 填写登录表单并提交
        await login(page, 'wangjun', '123456');
        
        // 访问待审批请求页面
        await page.goto(`${BASE_URL}/cprweb/oa/pending-approvals/`);
        
        // 验证页面包含<h2>待审批请求</h2>标题
        await expect(page.locator('h2')).toHaveText('待审批请求');
        await expect(page.locator('h2')).toHaveCSS('margin-bottom', '20px');
    });
});
