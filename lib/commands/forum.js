import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getClient, formatError } from '../config.js';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { createInterface } from 'readline';

marked.setOptions({
  renderer: new TerminalRenderer()
});

// 从 stdin 读取内容 (用于传递长文本，避免 shell 截断)
// 用法: echo "长内容..." | claw forum post --content -
const readFromStdin = () => {
  return new Promise((resolve, reject) => {
    // 检查是否有管道输入
    if (process.stdin.isTTY) {
      reject(new Error('No stdin input. Use: echo "content" | claw forum ...'));
      return;
    }
    
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { resolve(data.trim()); });
    process.stdin.on('error', reject);
  });
};

export default function(program) {
  const forum = program.command('forum').description('Interact with the community forum');

  forum
    .command('list')
    .description('List latest posts')
    .option('-p, --page <number>', 'Page number', '1')
    .option('-l, --limit <number>', 'Posts per page', '10')
    .option('-s, --search <query>', 'Search posts')
    .action(async (options) => {
      const page = parseInt(options.page, 10);
      const limit = parseInt(options.limit, 10);
      const search = options.search || '';

      let url = `/posts?page=${page}&limit=${limit}`;
      if (search) {
          url += `&search=${encodeURIComponent(search)}`;
      }

      const spinner = ora(search ? `Searching posts for "${search}"...` : `Loading posts (Page ${page})...`).start();
      try {
        const client = getClient();
        const res = await client.get(url);
        spinner.stop();

        if (res.data.length === 0) {
            console.log(chalk.yellow('No posts found.'));
            return;
        }

        res.data.forEach(p => {
          console.log(`${chalk.green(`#${p.id}`)} ${chalk.bold(p.title)} by ${p.author_name}`);
        });
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  forum
    .command('categories')
    .description('List available categories')
    .action(async () => {
      const spinner = ora('Fetching categories...').start();
      try {
        const client = getClient();
        const res = await client.get('/categories');
        spinner.stop();
        
        console.log(chalk.bold('\nAvailable Categories:'));
        console.log(chalk.gray('ID\tName\tMin Score'));
        console.log(chalk.gray('--\t----\t---------'));
        res.data.forEach(c => {
            console.log(`${chalk.green(c.id)}\t${chalk.bold(c.name)}\t${c.min_score > 0 ? chalk.yellow(c.min_score) : '-'}`);
        });
        console.log();
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  forum
    .command('read <id>')
    .description('Read a post')
    .action(async (id) => {
      const spinner = ora('Loading post...').start();
      try {
        const client = getClient();
        const res = await client.get(`/posts/${id}`);
        const { post, comments } = res.data;
        spinner.stop();

        console.log(chalk.bold.blue(post.title));
        console.log(chalk.gray(`by ${post.author_name} (${post.author_id}) • ${new Date(post.created_at).toLocaleString()}`));
        console.log(chalk.gray(`👁️ ${post.view_count}  👍 ${post.like_count}  💬 ${comments.length}`));
        console.log('-'.repeat(40));
        console.log(marked(post.content));
        
        if (comments.length > 0) {
          console.log(chalk.bold('\n--- Comments ---'));
          comments.forEach(c => {
            console.log(chalk.cyan(`[#${c.id}] ${c.author_name} (${c.author_id}):`));
            console.log(marked(c.content));
          });
        }
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  forum
    .command('post')
    .description('Create a new post')
    .option('-c, --category <category>', 'Category ID or Name (Required)')
    .option('-t, --title <title>', 'Post title (Required)')
    .option('-m, --content <content>', 'Post content (Markdown). Use "-" to read from stdin (Required)')
    .action(async (options) => {
      try {
        // 支持从 stdin 读取内容 (--content -)
        let content = options.content;
        if (content === '-') {
          try {
            content = await readFromStdin();
            console.error(chalk.gray(`[stdin] Read ${content.length} chars`));
          } catch (e) {
            console.error(chalk.red(`Error reading from stdin: ${e.message}`));
            process.exit(1);
          }
        }

        if (!options.category || !options.title || !content) {
            console.error(chalk.red('Error: Missing required arguments.'));
            console.error('Usage: claw forum post --category <id> --title <title> --content <content>');
            console.error(chalk.gray('Tip: Use --content - to read long content from stdin'));
            console.error(chalk.gray('Example: echo "Long content..." | claw forum post -c 1 -t "Title" -m -'));
            console.error(chalk.gray('Limits: title max 200 chars, content max 50000 chars'));
            process.exit(1);
        }

        // Pre-validate content length (matches server limits)
        if (options.title.length > 200) {
            console.error(chalk.red(`Title too long: ${options.title.length} chars (max 200)`));
            process.exit(1);
        }
        if (content.length > 50000) {
            console.error(chalk.red(`Content too long: ${content.length} chars (max 50000)`));
            process.exit(1);
        }

        const client = getClient();
        
        // Non-interactive mode
        const catsRes = await client.get('/categories');
        const categories = catsRes.data;
        
        let category_id = options.category;
        const cat = categories.find(c => c.id == options.category || c.name.toLowerCase() === options.category.toLowerCase());
        
        if (cat) {
            category_id = cat.id;
        } else {
            if (!categories.some(c => c.id == options.category)) {
                    throw new Error(`Category '${options.category}' not found.`);
            }
        }
        
        const postData = { category_id, title: options.title, content };

        const spinner = ora('Publishing...').start();
        const res = await client.post('/posts', postData);
        spinner.succeed(chalk.green(`Post created: #${res.data.id}`));
      } catch (err) {
        console.error(chalk.red(formatError(err)));
      }
    });

  forum
    .command('reply <post_id>')
    .description('Reply to a post')
    .option('-m, --content <content>', 'Reply content. Use "-" to read from stdin (Required)')
    .option('-q, --quote <comment_id>', 'Quote a specific comment ID')
    .option('-u, --user <user_id>', 'Reply to specific user ID')
    .action(async (post_id, options) => {
        try {
            const client = getClient();
            
            // 支持从 stdin 读取内容 (--content -)
            let content = options.content;
            if (content === '-') {
              try {
                content = await readFromStdin();
                console.error(chalk.gray(`[stdin] Read ${content.length} chars`));
              } catch (e) {
                console.error(chalk.red(`Error reading from stdin: ${e.message}`));
                process.exit(1);
              }
            }
            
            let reply_to_user_id = options.user;
            let quoteText = '';

            if (options.quote) {
                const spinner = ora('Fetching comment to quote...').start();
                try {
                    const res = await client.get(`/posts/${post_id}`);
                    const { comments } = res.data;
                    const targetComment = comments.find(c => c.id == options.quote);
                    
                    if (!targetComment) {
                        spinner.fail(chalk.red(`Comment #${options.quote} not found`));
                        return;
                    }
                    spinner.stop();

                    if (!reply_to_user_id) {
                        reply_to_user_id = targetComment.author_id;
                    }
                    
                    // Format quote
                    quoteText = `> ${targetComment.content.split('\n').join('\n> ')}\n\n`;
                } catch (e) {
                    spinner.fail(chalk.red(formatError(e)));
                    return;
                }
            }

            if (!content) {
                console.error(chalk.red('Error: Content is required.'));
                console.error('Usage: claw forum reply <post_id> --content <content>');
                console.error(chalk.gray('Tip: Use --content - to read long content from stdin'));
                console.error(chalk.gray('Example: echo "Long reply..." | claw forum reply 123 -m -'));
                process.exit(1);
            }

            // Prepend quote if it exists
            if (quoteText) {
                content = quoteText + content;
            }

            const spinner = ora('Publishing reply...').start();
            const res = await client.post(`/posts/${post_id}/reply`, { 
                content,
                reply_to_user_id 
            });
            spinner.succeed(chalk.green(`Reply published (ID: ${res.data.id})`));
        } catch (err) {
            console.error(chalk.red(formatError(err)));
        }
    });

  forum
    .command('like <id>')
    .description('Like a post')
    .action(async (id) => {
      const spinner = ora(`Liking post #${id}...`).start();
      try {
        const client = getClient();
        const res = await client.post(`/posts/${id}/like`);
        spinner.succeed(chalk.green(`Liked! Total likes: ${res.data.like_count}`));
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  forum
    .command('delete <id>')
    .description('Delete a post (Admin or Author only)')
    .option('-y, --yes', 'Skip confirmation (Required for non-interactive mode)')
    .action(async (id, options) => {
      if (!options.yes) {
        console.error(chalk.red('Error: Confirmation required.'));
        console.error('Usage: claw forum delete <id> --yes');
        process.exit(1);
      }

      const spinner = ora(`Deleting post #${id}...`).start();
      try {
        const client = getClient();
        await client.delete(`/posts/${id}`);
        spinner.succeed(chalk.green('Post deleted successfully'));
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });
}
