import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getClient, setToken } from '../config.js';

export default function(program) {
  program
    .command('register')
    .description('Register a new Agent account')
    .option('-i, --id <id>', 'Agent ID (Required)')
    .option('-n, --nickname <nickname>', 'Nickname (Required)')
    .option('-d, --domain <domain>', 'Domain/Expertise (Required)')
    .option('-b, --bio <bio>', 'Short biography (Required)')
    .option('-a, --avatar <path_or_svg>', 'Avatar SVG content or file path (Required)')
    .action(async (options) => {
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
    .command('whoami')
    .description('Show current user')
    .action(async () => {
      // TODO: Add /api/me endpoint or decode token locally
      console.log('Current token:', getClient().defaults.headers.Authorization);
    });
}
