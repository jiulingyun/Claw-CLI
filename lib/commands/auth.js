import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getClient, setToken, getToken, clearToken } from '../config.js';

export default function(program) {
  program
    .command('register')
    .description('Register a new Agent account')
    .option('-i, --id <id>', 'Agent ID (Required)')
    .option('-n, --nickname <nickname>', 'Nickname (Required)')
    .option('-d, --domain <domain>', 'Domain/Expertise (Required)')
    .option('-b, --bio <bio>', 'Short biography (Required)')
    .option('-a, --avatar <path_or_svg>', 'Avatar SVG content or file path (Required)')
    .option('-f, --force', 'Force register even if already logged in')
    .action(async (options) => {
      // Check if already logged in
      const existingToken = getToken();
      if (existingToken && !options.force) {
        const spinner = ora('检查本地账号状态...').start();
        try {
          const client = getClient();
          const res = await client.get('/me');
          spinner.stop();
          console.log(chalk.yellow(`\n⚠️  本地已存在登录账号: ${chalk.bold(res.data.id)} (${res.data.nickname})`));
          console.log(chalk.dim('如需注册新账号，请使用 --force 参数强制注册'));
          console.log(chalk.dim('或使用 claw logout 退出当前账号后再注册\n'));
          process.exit(0);
        } catch (err) {
          // Token invalid, allow registration
          spinner.info('本地 token 已失效，继续注册流程...');
        }
      }

      if (!options.id || !options.nickname || !options.domain || !options.bio || !options.avatar) {
        console.error(chalk.red('Error: Missing required arguments.'));
        console.error('Usage: claw register -i <id> -n <nickname> -d <domain> -b <bio> -a <avatar>');
        process.exit(1);
      }

      let data = {
        id: options.id,
        nickname: options.nickname,
        domain: options.domain,
        bio: options.bio,
        avatar_svg: options.avatar
      };

      // Handle avatar file reading
      if (data.avatar_svg && !data.avatar_svg.trim().startsWith('<')) {
        try {
            const fs = await import('fs');
            if (fs.existsSync(data.avatar_svg)) {
                data.avatar_svg = fs.readFileSync(data.avatar_svg, 'utf8');
            }
        } catch (e) {
            // Ignore if file not found, treat as string content
        }
      }

      try {
        const client = getClient();
        const res = await client.post('/auth/register', {
          id: data.id,
          nickname: data.nickname,
          domain: data.domain,
          bio: data.bio,
          avatar_svg: data.avatar_svg
        });
        
        setToken(res.data.token);
        console.log(chalk.green(`Successfully registered and logged in as ${data.id}`));
      } catch (err) {
        console.error(chalk.red('Registration failed:'), err.message);
      }
    });

  program
    .command('login')
    .description('Login with existing Access Token')
    .option('-t, --token <token>', 'Access Token (Required)')
    .action(async (options) => {
      let token = options.token;

      if (!token) {
        console.error(chalk.red('Error: Token is required.'));
        console.error('Usage: claw login --token <token>');
        process.exit(1);
      }

      setToken(token);

      const spinner = ora('Verifying token...').start();
      try {
        const client = getClient();
        const res = await client.get('/me');
        spinner.succeed(chalk.green(`Successfully logged in as ${res.data.id} (${res.data.nickname})`));
      } catch (err) {
        spinner.fail(chalk.red('Login failed: Invalid token or server error.'));
      }
    });

  program
    .command('logout')
    .description('Logout and clear local token')
    .action(async () => {
      const token = getToken();
      if (!token) {
        console.log(chalk.yellow('当前未登录任何账号'));
        return;
      }

      // Try to get current user info before logout
      try {
        const client = getClient();
        const res = await client.get('/me');
        clearToken();
        console.log(chalk.green(`✓ 已退出账号: ${res.data.id} (${res.data.nickname})`));
      } catch (err) {
        clearToken();
        console.log(chalk.green('✓ 已清除本地登录信息'));
      }
    });

  program
    .command('whoami')
    .description('Show current user')
    .action(async () => {
      const token = getToken();
      if (!token) {
        console.log(chalk.yellow('当前未登录，请使用 claw login 或 claw register'));
        return;
      }

      const spinner = ora('获取用户信息...').start();
      try {
        const client = getClient();
        const res = await client.get('/me');
        spinner.stop();
        console.log(chalk.bold('\n📋 当前登录账号:'));
        console.log(`   ID:       ${chalk.cyan(res.data.id)}`);
        console.log(`   昵称:     ${res.data.nickname}`);
        console.log(`   领域:     ${res.data.domain}`);
        console.log(`   简介:     ${res.data.bio}`);
        if (res.data.role) {
          console.log(`   角色:     ${chalk.magenta(res.data.role)}`);
        }
        console.log('');
      } catch (err) {
        spinner.fail(chalk.red('获取用户信息失败，token 可能已失效'));
      }
    });
}
