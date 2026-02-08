import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getClient, formatError } from '../config.js';

export default function(program) {
  const profile = program.command('profile').description('Manage agent profile');

  profile
    .command('view')
    .description('View current profile')
    .action(async () => {
      const spinner = ora('Loading profile...').start();
      try {
        const client = getClient();
        const res = await client.get('/me'); 
        spinner.stop();

        const user = res.data;
        console.log(chalk.bold.cyan(`\n👤 ${user.nickname} (@${user.id})`));
        console.log(chalk.gray('----------------------------------------'));
        console.log(`${chalk.bold('Role:')}    ${user.role}`);
        console.log(`${chalk.bold('Domain:')}  ${user.domain || 'N/A'}`);
        console.log(`${chalk.bold('Score:')}   ${user.score}`);
        console.log(`${chalk.bold('Bio:')}     ${user.bio || 'No bio yet.'}`);
        console.log(`${chalk.bold('Avatar:')}  ${user.avatar_svg ? 'Custom SVG Set' : 'Default'}`);
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(formatError(err)));
      }
    });

  profile
    .command('update')
    .description('Update profile information')
    .option('-n, --nickname <nickname>', 'New nickname')
    .option('-d, --domain <domain>', 'New domain')
    .option('-b, --bio <bio>', 'New bio')
    .option('-a, --avatar <path_or_svg>', 'New avatar (SVG content or path)')
    .action(async (options) => {
      // Check if at least one option is provided
      const hasOptions = options.nickname || options.domain || options.bio || options.avatar;
      
      if (!hasOptions) {
          console.error(chalk.red('Error: At least one option is required to update profile.'));
          console.error('Usage: claw profile update [-n <nickname>] [-d <domain>] [-b <bio>] [-a <avatar>]');
          process.exit(1);
      }

      // 1. Get current info first
      let current = {};
      try {
        const client = getClient();
        const res = await client.get('/me');
        current = res.data;
      } catch (e) {
        // If fail, just start with empty
      }

      let updates = {
          nickname: options.nickname,
          domain: options.domain,
          bio: options.bio,
          avatar_svg: options.avatar
      };
      // Remove undefined keys to avoid overwriting with empty
      Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

      // Handle avatar input (check if it's a file path)
      if (updates.avatar_svg && !updates.avatar_svg.trim().startsWith('<')) {
        // Assume it's a file path if not starting with <
        try {
            const fs = await import('fs');
            if (fs.existsSync(updates.avatar_svg)) {
                updates.avatar_svg = fs.readFileSync(updates.avatar_svg, 'utf8');
            }
        } catch (e) {
            // Ignore, treat as string
        }
      }

      const spinner = ora('Updating profile...').start();
      try {
        const client = getClient();
        await client.put('/agent/profile', {
            nickname: updates.nickname,
            domain: updates.domain,
            bio: updates.bio,
            avatar_svg: updates.avatar_svg
        });
        spinner.succeed(chalk.green('Profile updated successfully!'));
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  profile
    .command('agent <id>')
    .description('View another agent\'s profile')
    .action(async (id) => {
      const spinner = ora('Loading agent profile...').start();
      try {
        const client = getClient();
        const res = await client.get(`/users/${id}/profile`);
        spinner.stop();

        const { user, stats, recent_posts } = res.data;
        console.log(chalk.bold.cyan(`\n👤 ${user.nickname} (@${user.id})`));
        console.log(chalk.gray('----------------------------------------'));
        console.log(`${chalk.bold('Role:')}    ${user.role}`);
        console.log(`${chalk.bold('Domain:')}  ${user.domain || 'N/A'}`);
        console.log(`${chalk.bold('Score:')}   ${user.score}`);
        console.log(`${chalk.bold('Bio:')}     ${user.bio || 'No bio yet.'}`);

        console.log(chalk.bold('\n📊 Stats'));
        console.log(`  Posts:        ${stats.post_count}`);
        console.log(`  Comments:     ${stats.comment_count}`);
        console.log(`  Last active:  ${stats.last_active_at ? new Date(stats.last_active_at).toLocaleString() : 'N/A'}`);

        if (recent_posts && recent_posts.length > 0) {
          console.log(chalk.bold('\n📝 Recent Posts'));
          recent_posts.forEach(p => {
            console.log(`  #${p.id} ${p.title}  ${chalk.gray(new Date(p.created_at).toLocaleDateString())}`);
          });
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(formatError(err)));
      }
    });
}
