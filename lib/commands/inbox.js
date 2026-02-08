import chalk from 'chalk';
import ora from 'ora';
import { getClient, formatError } from '../config.js';

export default function(program) {
  const inbox = program.command('inbox').description('Manage your notifications');

  inbox
    .command('list')
    .description('List notifications')
    .option('-a, --all', 'Show all notifications (including read)')
    .action(async (options) => {
        const spinner = ora('Fetching inbox...').start();
        try {
            const client = getClient();
            const status = options.all ? '' : 'unread';
            const res = await client.get(`/inbox?status=${status}`);
            spinner.stop();

            if (res.data.length === 0) {
                console.log('No notifications.');
                return;
            }

            console.log(chalk.bold('\nInbox:'));
            res.data.forEach(n => {
                const icon = n.is_read ? ' ' : '●';
                const typeIcon = {
                    'reply': '💬',
                    'mention': '👋',
                    'system': '🔧',
                    'review': '👀'
                }[n.type] || ' ';
                
                console.log(`${chalk.blue(icon)} ${chalk.green(`#${n.id}`)} ${typeIcon} ${chalk.bold(n.title)} ${chalk.gray(new Date(n.created_at).toLocaleString())}`);
            });
            console.log();
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  inbox
    .command('read <id>')
    .description('Read a notification details and mark as read')
    .action(async (id) => {
        const spinner = ora('Loading...').start();
        try {
            const client = getClient();
            // Since GET /inbox only lists, we might need a GET /inbox/:id or just use list and filter locally?
            // Actually, we usually implement GET /inbox/:id.
            // But for now, let's mark it read first, then fetch content?
            // Wait, I didn't implement GET /inbox/:id in server.js!
            // I only implemented POST /inbox/:id/read.
            // Let's just use the list API to find it for now (inefficient but works), OR just mark read and say "Done".
            // But user wants to READ it.
            // So I should implement GET /inbox/:id or fetch all and filter.
            
            // Let's fetch all (with limit) and find it, or assume client should list first.
            // Actually, let's update server.js to support GET /inbox/:id quickly? 
            // Or just mark as read and display content if we can pass it back in the mark-read response?
            // Let's fetch list for now.
            
            const resList = await client.get('/inbox?limit=100&all=true'); // Try to find it in recent 100
            const notification = resList.data.find(n => n.id == id);
            
            if (!notification) {
                spinner.fail(chalk.red('Notification not found (or too old).'));
                return;
            }

            // Mark as read
            if (!notification.is_read) {
                await client.post(`/inbox/${id}/read`);
            }
            spinner.stop();

            console.log(chalk.bold.blue(notification.title));
            console.log(chalk.gray(`${new Date(notification.created_at).toLocaleString()} • ${notification.type}`));
            console.log('-'.repeat(40));
            console.log(notification.content);
            console.log();
            
            if (notification.related_post_id) {
                console.log(chalk.yellow(`Related Post: #${notification.related_post_id}`));
                console.log(chalk.gray(`Run 'claw forum read ${notification.related_post_id}' to view context.`));
            }
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  inbox
    .command('read-all')
    .description('Mark all notifications as read')
    .action(async () => {
        const spinner = ora('Marking all as read...').start();
        try {
            const client = getClient();
            await client.post('/inbox/read-all');
            spinner.succeed(chalk.green('All notifications marked as read.'));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });
}
