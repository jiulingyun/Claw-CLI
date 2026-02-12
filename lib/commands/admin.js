import chalk from 'chalk';
import ora from 'ora';
import { getClient, formatError } from '../config.js';

export default function(program) {
  const admin = program.command('admin').description('Administrative commands');

  admin
    .command('verify <user_id>')
    .description('Set verification status for a user')
    .option('-t, --type <type>', 'Verification type (official | expert | none) (Required)')
    .option('-r, --reason <reason>', 'Verification reason (Required if type is not none)')
    .action(async (user_id, options) => {
        if (!options.type) {
             console.error(chalk.red('Error: Verification type is required.'));
             console.error('Usage: claw admin verify <user_id> --type <official|expert|none> [--reason <reason>]');
             process.exit(1);
        }
        
        const type = options.type === 'none' ? null : options.type;
        const reason = options.reason;
        
        if (type && !reason) {
             console.error(chalk.red('Error: Verification reason is required for type ' + type));
             process.exit(1);
        }

        const spinner = ora(`Updating verification for ${user_id}...`).start();
        try {
            const client = getClient();
            await client.post(`/admin/users/${user_id}/verify`, { type, reason });
            spinner.succeed(chalk.green('Verification updated successfully!'));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  // Category Management
  const category = admin.command('category').description('Manage forum categories');
  
  category
    .command('list')
    .description('List all categories')
    .action(async () => {
        const spinner = ora('Fetching categories...').start();
        try {
            const client = getClient();
            const res = await client.get('/categories');
            spinner.stop();
            
            if (res.data.length === 0) {
                console.log(chalk.yellow('No categories found.'));
                return;
            }

            console.log(chalk.bold('\nCategories:'));
            res.data.forEach(c => {
                console.log(`  ${chalk.cyan(`#${c.id}`)} ${chalk.bold(c.name)} ${chalk.gray(`(min_score: ${c.min_score})`)}`);
                if (c.description) console.log(`    ${chalk.gray(c.description)}`);
            });
            console.log();
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  category
    .command('add')
    .description('Create a new category')
    .option('-n, --name <name>', 'Category name (Required)')
    .option('-d, --description <desc>', 'Description')
    .option('-s, --min-score <score>', 'Minimum score required', '0')
    .action(async (options) => {
        if (!options.name) {
            console.error(chalk.red('Error: Name is required.'));
            console.error('Usage: claw admin category add --name <name> [--description <desc>] [--min-score <score>]');
            process.exit(1);
        }
        
        const spinner = ora('Creating category...').start();
        try {
            const client = getClient();
            const res = await client.post('/admin/categories', {
                name: options.name,
                description: options.description,
                min_score: parseInt(options.minScore)
            });
            spinner.succeed(chalk.green(`Category created: #${res.data.id} ${options.name}`));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  category
    .command('update <id>')
    .description('Update a category')
    .option('-n, --name <name>', 'New category name')
    .option('-d, --description <desc>', 'New description')
    .option('-s, --min-score <score>', 'New minimum score')
    .action(async (id, options) => {
        if (!options.name && !options.description && options.minScore === undefined) {
            console.error(chalk.red('Error: At least one field to update is required.'));
            console.error('Usage: claw admin category update <id> [--name <name>] [--description <desc>] [--min-score <score>]');
            process.exit(1);
        }

        const body = {};
        if (options.name) body.name = options.name;
        if (options.description) body.description = options.description;
        if (options.minScore !== undefined) body.min_score = parseInt(options.minScore);

        const spinner = ora(`Updating category #${id}...`).start();
        try {
            const client = getClient();
            await client.put(`/admin/categories/${id}`, body);
            spinner.succeed(chalk.green(`Category #${id} updated successfully!`));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  category
    .command('delete <id>')
    .description('Delete a category (must have no posts)')
    .action(async (id) => {
        const spinner = ora(`Deleting category #${id}...`).start();
        try {
            const client = getClient();
            await client.delete(`/admin/categories/${id}`);
            spinner.succeed(chalk.green(`Category #${id} deleted successfully!`));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  // Rules Management
  const rules = admin.command('rules').description('Manage community rules');
  
  rules
    .command('update')
    .description('Update community rules')
    .option('-c, --content <content>', 'Rules content (Markdown) (Required)')
    .action(async (options) => {
        if (!options.content) {
            console.error(chalk.red('Error: Content is required.'));
            console.error('Usage: claw admin rules update --content <content>');
            process.exit(1);
        }
        
        const spinner = ora('Updating rules...').start();
        try {
            const client = getClient();
            await client.put('/admin/rules', { content: options.content });
            spinner.succeed(chalk.green('Rules updated successfully!'));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  // 4. Skill Review
  const skill = admin.command('skill').description('Manage skills');
  
  skill
    .command('list')
    .description('List pending skills for review')
    .action(async () => {
        const spinner = ora('Fetching pending skills...').start();
        try {
            const client = getClient();
            const res = await client.get('/skills?status=pending');
            spinner.stop();

            if (res.data.length === 0) {
                console.log(chalk.yellow('No pending skills found.'));
                return;
            }

            console.log(chalk.bold('\nPending Skills:'));
            res.data.forEach(s => {
                console.log(`${chalk.green(s.id)} (v${s.version}) by ${s.owner_name}`);
                console.log(chalk.gray(`  ${s.description}`));
                console.log(chalk.blue(`  Updated: ${new Date(s.updated_at).toLocaleString()}`));
                console.log();
            });
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  skill
    .command('view <id>')
    .description('View detailed info of a skill (including pending)')
    .action(async (id) => {
        const spinner = ora(`Fetching skill ${id}...`).start();
        try {
            const client = getClient();
            const res = await client.get(`/skills/${encodeURIComponent(id)}`);
            spinner.stop();
            
            const s = res.data;
            console.log(chalk.bold(`\n${'='.repeat(60)}`));
            console.log(chalk.bold(`${s.icon || '📦'} ${s.name}`));
            console.log(chalk.bold(`${'='.repeat(60)}`));
            console.log(`${chalk.cyan('ID:')} ${s.id}`);
            console.log(`${chalk.cyan('Version:')} ${s.version}`);
            console.log(`${chalk.cyan('Status:')} ${s.status === 'approved' ? chalk.green(s.status) : s.status === 'pending' ? chalk.yellow(s.status) : chalk.red(s.status)}`);
            console.log(`${chalk.cyan('Author:')} ${s.owner_name} (${s.owner_id})`);
            console.log(`${chalk.cyan('Description:')} ${s.description}`);
            console.log(`${chalk.cyan('Created:')} ${new Date(s.created_at).toLocaleString()}`);
            console.log(`${chalk.cyan('Updated:')} ${new Date(s.updated_at).toLocaleString()}`);
            
            // Show files list
            if (s.files) {
                let filesMap = {};
                try {
                    filesMap = typeof s.files === 'string' ? JSON.parse(s.files) : s.files;
                } catch (e) {}
                const fileNames = Object.keys(filesMap);
                if (fileNames.length > 0) {
                    console.log(`${chalk.cyan('Files:')} ${fileNames.join(', ')}`);
                }
            }
            
            // Show metadata
            if (s.metadata) {
                let meta = {};
                try {
                    meta = typeof s.metadata === 'string' ? JSON.parse(s.metadata) : s.metadata;
                } catch (e) {}
                if (Object.keys(meta).length > 0) {
                    console.log(`${chalk.cyan('Metadata:')} ${JSON.stringify(meta, null, 2)}`);
                }
            }
            
            console.log(chalk.bold(`\n${'─'.repeat(60)}`));
            console.log(chalk.cyan('README:'));
            console.log(chalk.bold(`${'─'.repeat(60)}\n`));
            console.log(s.readme || '(No readme)');
            console.log();
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  skill
    .command('install <id>')
    .description('Install a skill to local for testing (admin can install pending skills)')
    .action(async (id) => {
        const spinner = ora(`Installing ${id} for testing...`).start();
        try {
            const client = getClient();
            const res = await client.get(`/skills/${encodeURIComponent(id)}`);
            const s = res.data;
            
            if (s.status !== 'approved') {
                spinner.info(chalk.yellow(`Note: This skill is in "${s.status}" status.`));
            }
            
            // Determine install path
            const os = await import('os');
            const fs = await import('fs');
            const path = await import('path');
            const matter = (await import('gray-matter')).default;
            
            const baseDir = process.env.OPENCLAW_INSTALL_DIR || 
                (process.env.OPENCLAW_HOME ? path.default.join(process.env.OPENCLAW_HOME, '.openclaw') : path.default.join(os.default.homedir(), '.openclaw'));
            const folderName = s.id.replace('/', '__');
            const installDir = path.default.join(baseDir, 'skills', folderName);
            
            if (fs.default.existsSync(installDir)) {
                fs.default.rmSync(installDir, { recursive: true });
            }
            fs.default.mkdirSync(installDir, { recursive: true });

            // Restore files
            if (s.files) {
                let filesMap = {};
                try {
                    filesMap = typeof s.files === 'string' ? JSON.parse(s.files) : s.files;
                } catch (e) {}

                for (const [relPath, content] of Object.entries(filesMap)) {
                    if (relPath.includes('..')) continue;
                    const targetPath = path.default.join(installDir, relPath);
                    const targetDir = path.default.dirname(targetPath);
                    if (!fs.default.existsSync(targetDir)) {
                        fs.default.mkdirSync(targetDir, { recursive: true });
                    }
                    fs.default.writeFileSync(targetPath, content);
                }
            }

            // Write SKILL.md
            let metadata = {};
            if (s.metadata) {
                try { metadata = JSON.parse(s.metadata); } catch (e) {}
            }

            const frontmatterData = {
                id: s.id,
                owner_id: s.owner_id,
                name: s.name,
                description: s.description,
                version: s.version,
                icon: s.icon,
                author: s.owner_name,
                status: s.status,
            };
            if (Object.keys(metadata).length > 0) {
                frontmatterData.metadata = metadata;
            }

            const frontmatter = matter.stringify(s.readme || '', frontmatterData);
            fs.default.writeFileSync(path.default.join(installDir, 'SKILL.md'), frontmatter);

            spinner.succeed(chalk.green(`Installed to ${installDir}`));
            if (s.status !== 'approved') {
                console.log(chalk.yellow(`⚠️  This skill is "${s.status}" - for testing/review purposes only.`));
            }
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  skill
    .command('review <id>')
    .description('Review a skill submission')
    .option('--approve', 'Approve the skill')
    .option('--reject', 'Reject the skill')
    .option('--note <reason>', 'Review note/reason')
    .action(async (id, options) => {
        if (!options.approve && !options.reject) {
            console.error(chalk.red('Error: Must specify --approve or --reject.'));
            console.error('Usage: claw admin skill review <id> --approve | --reject [--note <reason>]');
            process.exit(1);
        }
        if (options.approve && options.reject) {
            console.error(chalk.red('Error: Cannot approve and reject at the same time.'));
            process.exit(1);
        }
        
        const action = options.approve ? 'approve' : 'reject';
        
        const spinner = ora(`Reviewing skill ${id}...`).start();
        try {
            const client = getClient();
            await client.post(`/admin/skills/${encodeURIComponent(id)}/review`, {
                action,
                note: options.note
            });
            spinner.succeed(chalk.green(`Skill ${id} ${action}d successfully!`));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  skill
    .command('delete <id>')
    .description('Delete a skill from the market')
    .action(async (id) => {
        const spinner = ora(`Deleting skill ${id}...`).start();
        try {
            const client = getClient();
            await client.delete(`/admin/skills/${encodeURIComponent(id)}`);
            spinner.succeed(chalk.green(`Skill ${id} deleted successfully!`));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  // Post Management
  const post = admin.command('post').description('Manage posts');

  post
    .command('pin <id>')
    .description('Pin a post to the top of the forum')
    .action(async (id) => {
        const spinner = ora(`Pinning post #${id}...`).start();
        try {
            const client = getClient();
            await client.post(`/admin/posts/${id}/pin`, { pinned: true });
            spinner.succeed(chalk.green(`Post #${id} pinned successfully! 📌`));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  post
    .command('unpin <id>')
    .description('Unpin a post')
    .action(async (id) => {
        const spinner = ora(`Unpinning post #${id}...`).start();
        try {
            const client = getClient();
            await client.post(`/admin/posts/${id}/pin`, { pinned: false });
            spinner.succeed(chalk.green(`Post #${id} unpinned successfully!`));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });

  // Moderation Tools
  const moderation = admin.command('moderation').description('Content moderation tools');
  
  moderation
    .command('retry <id>')
    .description('Retry AI moderation for a post or comment')
    .option('-t, --type <type>', 'Content type (post|comment)', 'post')
    .action(async (id, options) => {
        const spinner = ora(`Triggering moderation check for ${options.type} #${id}...`).start();
        try {
            const client = getClient();
            await client.post(`/admin/moderation/retry/${id}`, { type: options.type });
            spinner.succeed(chalk.green('Moderation check triggered successfully. Check server logs for results.'));
        } catch (err) {
            spinner.fail(chalk.red(formatError(err)));
        }
    });
}
