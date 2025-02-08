1,项目使用playwright框架<br>
2,目前只做了一些简单的测试（登录功能，相应的界面是否能正常打开等）<br>
3,目标是做到有业务逻辑的测试<br>
5,页面注释
    applySeed.spec.ts :申请种子测试，测试申请种子功能，发送邮件功能（因为有两个背景调查的人，所以是发送2个邮件）

    emailApproval.spec.ts : 邮件审批功能（全部同意），模拟用户登录邮件审批太麻烦了，这里是从数据库里面取得审批连接访问的

    emailreject.spec.ts :类似emailApproval.spec.ts,最后一步拒绝

    systemApproval.spec.ts: 模拟系统审批功能（可以传递参数，设置第四步是同意还是拒绝）。TODO:第几步也需要参数化，上面两个也要做类似的修改。调用方法：$env:APPROVE_STEP4="false"; npx playwright test tests/systemApproval.spec.ts     （windows系统调用）


