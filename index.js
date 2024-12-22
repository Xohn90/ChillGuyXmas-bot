(async () => {
    // 导入所需模块
    const fetch = (await import('node-fetch')).default;  // 导入 node-fetch 模块，用于发送 HTTP 请求
    const chalk = (await import('chalk')).default;  // 导入 chalk 模块，用于输出彩色文字
    const fs = require('fs').promises;  // 导入 fs 模块的 promise 版本，用于文件操作

    const CONFIG = {
      BASE_URL: "https://api.chillguyxmas.com",
      SLEEP_INTERVAL: 2 * 60 * 60 * 1000, // 每 2 小时
      AUTH_FILE: "auth.txt",
    };

    // 请求头模板
    const headersTemplate = {
        'Accept': 'application/json, text/plain, */*',  // 接受的响应类型
        'Content-Type': 'application/json; charset=utf-8',  // 请求体的内容类型
        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"  // 用户代理
    };

    // 获取当前时间
    function getCurrentTime() {
      const now = new Date(Date.now());
      const [year, month, day, hours, minutes, seconds] = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ];
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // coday 函数，用于发送 HTTP 请求
    async function coday(url, method, payloadData = null, headers = headersTemplate) {
        try {
            const options = {
                method,  // 请求方法
                headers,  // 请求头
                body: payloadData ? JSON.stringify(payloadData) : null  // 如果有请求体数据，转换为 JSON 格式
            };
            const response = await fetch(url, options);  // 发送请求并等待响应
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);  // 如果响应状态不成功，抛出错误
            return await response.json();  // 返回 JSON 格式的响应数据
        } catch (error) {
            console.error('错误:', error);  // 捕获并输出错误
        }
    }

    // 加载账户会话数据
    async function loadSessions() {
        try {
            const data = await fs.readFile(CONFIG.AUTH_FILE, 'utf8');
            return data.split('\n').filter(account => account.trim() !== '');
        } catch (error) {
            console.error("加载账户时出错:", error);
            return [];
        }
    }

    async function getStatus(headers) {
        const status = await coday(`${CONFIG.BASE_URL}/api/mining/status`, 'GET', null, headers);

        const { endTime, duration } = status.miningSession || {};
        let remainTime = endTime - new Date().getTime();
        if (remainTime < 0) remainTime = 0;
        if (remainTime > 0) {
            console.log(chalk.blue(`未到获取时间，请稍等...`));
        } else {
            console.log(chalk.blue(`获取周期到,开始获取CGX`));
        }
        return remainTime;
    }

    async function claim(headers) {
        const claim = await coday(`${CONFIG.BASE_URL}/api/mining/claim`, 'GET', null, headers);

        if (claim && claim.success) {
            console.log(chalk.blue(`获取到CGX: ${claim.tokensEarned}`));
            return true;
        } else {
            console.error(chalk.red(`获取CGX失败`));
        }
        return false;
    }

    async function start(headers) {
        const start = await coday(`${CONFIG.BASE_URL}/api/mining/start`, 'POST', null, headers);

        if (start && start.success) {
            console.log(chalk.blue(`重新开始挖矿成功`));
            return start.miningSession.duration;
        } else {
            console.error(chalk.red(`重新开始挖矿失败`));
        }
        return 0;
    }

    async function dailyCheckIn(headers) {
        const mission = await coday(`${CONFIG.BASE_URL}/api/mission`, 'GET', null, headers);

        if (mission && mission.success) {
            const {currentDay, nextClaimAt, dailyRewards} = mission.missions[0] || {};
            let date = new Date(nextClaimAt);
            let milliseconds = date.getTime();
            if(new Date().getTime() > milliseconds){
                for (let i = 0; i < dailyRewards.length; i++) {
                    const {day, completed} = dailyRewards[i];

                    if (day === currentDay+1 && !completed) {
                        const payload = {day: day};
                        const claim = await coday(`${CONFIG.BASE_URL}/api/mission/daily/claim`, 'POST', payload, headers);
                        if (claim && claim.success) {
                            console.log(chalk.blue(`领取每日签到奖励成功`));
                            break;
                        }
                    }
                }
            }
            return true;
        } else {
            console.error(chalk.red(`每日签到失败`));
        }
        return false;
    }

    // 领取奖励
    async function ClaimCheckIn(token) {
        const headers = { ...headersTemplate, 'Authorization': `tma ${token}` };  // 添加授权头

        const authInfo = await coday(`${CONFIG.BASE_URL}/api/auth`, 'POST', {}, headers);

        if (authInfo) {
            const { username, solBalance, cgxmasBalance } = authInfo.user || {};
            console.log(chalk.blue(`用户: ${username} | solBalance: ${solBalance} | cgxmasBalance: ${cgxmasBalance}`));
            let remainTime = await getStatus(headers);
            if (remainTime === 0) {
                await delay(1000);
                await claim(headers);
                await delay(1000);
                remainTime = await start(headers);
            }
            await dailyCheckIn(headers);
            return remainTime;
        } else {
            console.error(chalk.red(`获取信息失败`));
        }
        return CONFIG.SLEEP_INTERVAL;
    }

    // 主函数
    async function main() {
        const sessions = await loadSessions();  // 加载账户会话数据
        if (sessions.length === 0) {
            console.log("未找到账户信息。");
            return;
        }

        while (true) {
            let nextTime = 0;
            console.log(`${getCurrentTime()}开始为所有账户进行获取...`);

            for (const token of sessions) {
                if (token) nextTime = await ClaimCheckIn(token);
            }
            nextTime += Math.floor(Math.random()*30000)+5000;
            console.log(`所有账户已处理。等待 ${Math.floor(nextTime/1000/3600)}h${Math.floor(nextTime/1000/60)%60}m${Math.floor(nextTime/1000)%60}s后进行下一次获取...`);
            await new Promise(resolve => setTimeout(resolve, nextTime));
        }
    }

    main();  // 运行主函数
})();
