import { test, expect, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

// 通过邮件审批，全部同意的流程
// 数据库配置
const dbConfig = {
    host: '127.0.0.1',
    user: 'root',  // 替换为你的数据库用户名
    password: 'root', // 替换为你的数据库密码
    database: 'cpronline'
};

// 基础URL
const BASE_URL = 'http://127.0.0.1:18080';
let requestId = 0;

// 从操作日志中解析邮件信息
interface EmailInfo {
    requestId: string;
    approvalId: string;
    approveUrl: string;
    rejectUrl: string;
}

interface ApprovalStatus {
    status: 'approved' | 'rejected';
    details: string;
}

async function parseEmailDesc(desc: string): Promise<EmailInfo> {
    const requestIdMatch = desc.match(/申请编号:\s*(\d+)/);
    const approvalIdMatch = desc.match(/审批编号:\s*(\d+)/);
    const approveUrlMatch = desc.match(/批准链接:\s*(http[^;]+)/);
    const rejectUrlMatch = desc.match(/拒绝链接:\s*(http[^;]+)/);

    if (!requestIdMatch || !approvalIdMatch || !approveUrlMatch || !rejectUrlMatch) {
        throw new Error('无法从邮件描述中解析所需信息');
    }

    // 设置全局requestId
    requestId = parseInt(requestIdMatch[1]);

    return {
        requestId: requestIdMatch[1],
        approvalId: approvalIdMatch[1],
        approveUrl: approveUrlMatch[1],
        rejectUrl: rejectUrlMatch[1]
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
            return null; // 返回null表示没有找到新的邮件
        }

        const latestLog = rows[0] as { operation_desc: string };
        return await parseEmailDesc(latestLog.operation_desc);
    } finally {
        await connection.end();
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
            
            // 访问审批链接
            await page.goto(emailInfo.approveUrl);
            await page.waitForLoadState('networkidle');

            // 点击确认按钮
            // await page.click('button[type="submit"]');
            // await page.waitForLoadState('networkidle');

            // 验证审批成功
            await expect(page.locator('.messages .success')).toHaveText('审批成功');
            await expect(page.locator('h1')).toHaveText('审批成功');
            await expect(page.locator('p')).toHaveText('您的审批操作已成功完成。');

            return true;
        }

        // 等待一段时间后再次尝试
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    return false; // 表示没有更多的审批邮件了
}

test.describe('种子申请审批流程', () => {
    test('完整审批流程', async ({ page }) => {
        // 获取第一个审批邮件
        const initialEmailInfo = await getLatestEmailLog();
        if (!initialEmailInfo) {
            throw new Error('未找到初始审批邮件');
        }
        
        console.log('获取到初始邮件信息:', initialEmailInfo);
        console.log('当前申请编号:', requestId);

        // 处理第一个审批
        await page.goto(initialEmailInfo.approveUrl);
        await page.waitForLoadState('networkidle');
        // await page.click('button[type="submit"]');
        // await page.waitForLoadState('networkidle');

        // 验证第一次审批成功
        await expect(page.locator('.messages .success')).toHaveText('审批成功');
        await expect(page.locator('h1')).toHaveText('审批成功');
        await expect(page.locator('p')).toHaveText('您的审批操作已成功完成。');

        // 循环处理后续审批
        let hasMoreApprovals = true;
        while (hasMoreApprovals) {
            hasMoreApprovals = await waitForNextApproval(page);
            if (!hasMoreApprovals) {
                // 再次检查最终状态
                const finalStatus = await checkApprovalFinished();
                if (finalStatus) {
                    console.log('审批流程最终状态:', finalStatus);
                    // 可以根据状态做一些验证
                    if (finalStatus.status === 'approved') {
                        console.log('申请已通过，审批详情:', finalStatus.details);
                    } else {
                        console.log('申请被拒绝，拒绝原因:', finalStatus.details);
                    }
                }
                console.log('审批流程完成');
                break;
            }
        }
    });
});