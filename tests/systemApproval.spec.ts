import { test, expect, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

// 通过系统界面进行审批
// 数据库配置
const dbConfig = {
    host: '127.0.0.1',
    user: 'root',  // 替换为你的数据库用户名
    password: 'root', // 替换为你的数据库密码
    database: 'cpronline'
};

// 基础URL
const BASE_URL = 'http://127.0.0.1:8000';
let requestId = 0;
let approvalCount = 0; // 用于跟踪当前是第几步审批

// 从命令行参数获取第四步是否同意
const shouldApproveStep4 = process.env.APPROVE_STEP4 !== 'false';

// 用户密码配置
const userPasswords: { [key: string]: string } = {
    'wangjun': '123456',
    't2024087': '123456',
    '20282233': '123456',
    // 添加其他用户的密码
};

// 从操作日志中解析邮件信息
interface EmailInfo {
    recipient: string;
    requestId: string;
    approvalId: string;
}

interface ApprovalStatus {
    status: 'approved' | 'rejected';
    details: string;
}

async function parseEmailDesc(desc: string): Promise<EmailInfo> {
    const recipientMatch = desc.match(/收件人：(\w+)/);
    const requestIdMatch = desc.match(/申请编号:\s*(\d+)/);
    const approvalIdMatch = desc.match(/审批编号:\s*(\d+)/);

    if (!recipientMatch || !requestIdMatch || !approvalIdMatch) {
        throw new Error('无法从邮件描述中解析所需信息');
    }

    // 设置全局requestId
    requestId = parseInt(requestIdMatch[1]);

    return {
        recipient: recipientMatch[1],
        requestId: requestIdMatch[1],
        approvalId: approvalIdMatch[1]
    };
}

// 检查审批是否完成
async function checkApprovalFinished(): Promise<ApprovalStatus | null> {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute(
            'SELECT operation_desc FROM operation_log WHERE operation_type = ? AND operation_desc LIKE ? ORDER BY operation_time DESC LIMIT 1',
            ['Approve_Finish', `%申请编号: ${requestId}%`]
        );

        if (!Array.isArray(rows) || rows.length === 0) {
            return null;
        }

        const desc = (rows[0] as { operation_desc: string }).operation_desc;
        const statusMatch = desc.match(/审批状态为:(\w+)/);
        const detailsMatch = desc.match(/审批详情:\s*(.+)$/);

        if (!statusMatch) {
            throw new Error('无法解析审批状态');
        }

        return {
            status: statusMatch[1] === 'approved' ? 'approved' : 'rejected',
            details: detailsMatch ? detailsMatch[1].trim() : ''
        };
    } finally {
        await connection.end();
    }
}

// 获取最新的邮件记录
async function getLatestEmailLog(): Promise<EmailInfo | null> {
    const connection = await mysql.createConnection(dbConfig);
    try {
        let query = 'SELECT operation_desc FROM operation_log WHERE operation_type = ?';
        const params: any[] = ['Send_Email'];

        // 如果requestId不为0，添加requestId条件
        if (requestId !== 0) {
            query += ' AND operation_desc LIKE ?';
            params.push(`%申请编号: ${requestId}%`);
        }

        query += ' ORDER BY operation_time DESC LIMIT 1';
        
        const [rows] = await connection.execute(query, params);

        if (!Array.isArray(rows) || rows.length === 0) {
            return null;
        }

        const latestLog = rows[0] as { operation_desc: string };
        return await parseEmailDesc(latestLog.operation_desc);
    } finally {
        await connection.end();
    }
}

// 系统登录
async function systemLogin(page: Page, username: string): Promise<void> {
    // 检查用户密码是否配置（忽略大小写）
    const normalizedUsername = username.toLowerCase();
    const userKey = Object.keys(userPasswords).find(key => key.toLowerCase() === normalizedUsername);
    
    if (!userKey) {
        throw new Error(`未找到用户 ${username} 的密码配置`);
    }

    // 访问登录页面
    await page.goto(`${BASE_URL}/cprweb/accounts/login/`);
    await page.waitForSelector('#id_username', { timeout: 10000 });
    
    // 填写登录表单，使用原始用户名
    await page.fill('#id_username', username);
    await page.fill('#id_password', userPasswords[userKey]);
    
    // 提交登录表单
    await Promise.all([
        page.waitForNavigation({ timeout: 180000 }),
        page.click('button[type="submit"]')
    ]);

    // 验证登录成功
    // await expect(page.locator('.user-info')).toContainText(`当前用户: ${username}`);
}

// 处理系统审批
async function handleSystemApproval(page: Page, isApprove: boolean = true): Promise<void> {
    // 访问待审批页面
    await page.goto(`${BASE_URL}/cprweb/oa/pending-approvals/`);
    await page.waitForLoadState('networkidle');

    // 查找包含当前requestId的链接
    const approvalLink = page.locator(`a[href*="/cprweb/oa/approval/${requestId}/"]`);
    await expect(approvalLink).toBeVisible();

    // 点击审批按钮
    await approvalLink.click();
    await page.waitForLoadState('networkidle');

    // 填写审批意见
    const commentSelector = 'textarea[name="comment"]';
    await expect(page.locator(commentSelector)).toBeVisible();
    await page.fill(commentSelector, isApprove ? '系统审批：同意' : '系统审批：拒绝');

    // 点击通过或拒绝按钮
    const buttonSelector = isApprove ? 'button[value="approve"]' : 'button[value="reject"]';
    await page.click(buttonSelector);
    await page.waitForLoadState('networkidle');

    // 验证审批成功
    if (isApprove) {
        await expect(page.locator('ul.messages li.success')).toHaveText('审批成功');
    }
    else{
        await expect(page.locator('ul.messages li.success')).toHaveText('已拒绝申请');
    }

}

// 等待并处理下一个审批邮件
async function waitForNextApproval(page: Page, maxAttempts: number = 10, interval: number = 3000): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        console.log(`尝试获取下一个审批邮件 (尝试 ${i + 1}/${maxAttempts})...`);
        
        // 首先检查审批是否已经完成
        const approvalStatus = await checkApprovalFinished();
        if (approvalStatus) {
            console.log('审批流程已完成:', approvalStatus);
            return false;
        }

        const emailInfo = await getLatestEmailLog();
        if (emailInfo) {
            console.log('找到新的审批邮件:', emailInfo);
            
            // 登出当前用户（如果已登录）
            await page.goto(`${BASE_URL}/cprweb/accounts/logout/`);
            await page.waitForLoadState('networkidle');
            
            // 使用新用户登录
            await systemLogin(page, emailInfo.recipient);
            
            // 增加审批计数
            approvalCount++;
            console.log('当前是第', approvalCount, '步审批');
            
            // 处理审批，第四步时根据参数决定是否同意
            const isApprove = approvalCount === 4 ? shouldApproveStep4 : true;
            await handleSystemApproval(page, isApprove);
            
            if (approvalCount === 4) {
                console.log(isApprove ? '第四步：同意' : '第四步：拒绝');
            }
            
            return true;
        }

        // 等待一段时间后再次尝试
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    return false;
}

test.describe('系统审批流程', () => {
    test('通过系统界面审批', async ({ page }) => {
        // 获取最新的邮件信息
        const emailInfo = await getLatestEmailLog();
        if (!emailInfo) {
            throw new Error('未找到初始审批邮件');
        }
        console.log('获取到初始邮件信息:', emailInfo);

        // 系统登录
        await systemLogin(page, emailInfo.recipient);
        console.log('登录成功，用户:', emailInfo.recipient);

        // 处理第一个审批
        approvalCount++;
        console.log('当前是第', approvalCount, '步审批');
        await handleSystemApproval(page, true);
        console.log('完成第一个审批，申请编号:', requestId);

        // 循环处理后续审批
        let hasMoreApprovals = true;
        while (hasMoreApprovals) {
            hasMoreApprovals = await waitForNextApproval(page);
            if (!hasMoreApprovals) {
                // 再次检查最终状态
                const finalStatus = await checkApprovalFinished();
                if (finalStatus) {
                    console.log('审批流程最终状态:', finalStatus);
                    // 根据第四步的操作验证最终状态
                    if (shouldApproveStep4) {
                        expect(finalStatus.status).toBe('approved');
                        console.log('申请已通过，审批详情:', finalStatus.details);
                    } else {
                        expect(finalStatus.status).toBe('rejected');
                        console.log('申请已拒绝，拒绝原因:', finalStatus.details);
                    }
                }
                console.log('审批流程完成');
                break;
            }
        }
    });
});