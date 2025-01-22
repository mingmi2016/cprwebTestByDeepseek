import { test, expect } from '@playwright/test';

test.describe('登录功能测试', () => {
  test('成功登录', async ({ page }) => {
    await page.goto('http://127.0.0.1:18080/cprweb/accounts/login/');
    console.log('Page title:', await page.title());
    await page.waitForSelector('#id_username', { timeout: 10000 });
    
    // 填写登录表单
    // 获取CSRF token
    const csrfToken = await page.$eval('input[name="csrfmiddlewaretoken"]', (el: HTMLInputElement) => el.value);
    
    // 填写登录表单并提交
    await page.fill('#id_username', 'wangjun');
    await page.fill('#id_password', '123456');
    
    // 提交登录表单并等待页面跳转
    await Promise.all([
      page.waitForNavigation({ timeout: 180000 }),
      page.click('button[type="submit"]')
    ]);
    
    // 验证跳转后的URL
    await expect(page).toHaveURL(/cprweb\/ccge/, { timeout: 180000 });
    
    // 等待页面加载完成
    await page.waitForLoadState('networkidle', { timeout: 180000 });
    
    // 验证页面标题
    await expect(page.locator('div > p').first()).toContainText('Welcome to the CRISPR/CAS gene editing web service', { timeout: 180000 });
  });

  test('错误密码登录', async ({ page }) => {
    await page.goto('http://127.0.0.1:18080/cprweb/accounts/login/');
    await page.waitForSelector('#id_username', { timeout: 60000 });
    
    await page.fill('#id_username', 'testuser');
    await page.fill('#id_password', 'wrongpass');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.alert-danger')).toContainText('Your username and password didn\'t match. Please try again.', { timeout: 120000 });
  });

  test('审批历史页面', async ({ page }) => {
    // 先登录
    await page.goto('http://127.0.0.1:18080/cprweb/accounts/login/');
    await page.waitForSelector('#id_username', { timeout: 10000 });
    
    // 获取CSRF token
    const csrfToken = await page.$eval('input[name="csrfmiddlewaretoken"]', (el: HTMLInputElement) => el.value);
    
    // 填写登录表单并提交
    await page.fill('#id_username', 'wangjun');
    await page.fill('#id_password', '123456');
    
    // 提交登录表单并等待页面跳转
    await Promise.all([
      page.waitForNavigation({ timeout: 180000 }),
      page.click('button[type="submit"]')
    ]);
    
    // 访问审批历史页面
    await page.goto('http://127.0.0.1:18080/cprweb/oa/approval-history/');
    
    // 验证页面包含<h2>审批历史</h2>标题
    await expect(page.locator('h2')).toHaveText('审批历史');
    
    // 验证重发邮件按钮存在
    const resendButton = page.locator('button.btn-resend').first();
    await expect(resendButton).toBeVisible();
    await expect(resendButton).toHaveText('重发邮件');
  });
});
