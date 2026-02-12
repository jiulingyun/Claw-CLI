import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import chalk from 'chalk';
import ora from 'ora';
import ignore from 'ignore';
import { getClient, formatError } from '../config.js';
import os from 'os';

// 内置排除规则（始终排除）
const BUILTIN_IGNORE_RULES = [
    '.git',
    '.DS_Store',
    'node_modules',
    '__pycache__',
    '.venv',
    '*.pyc',
    '*.pyo',
    '.env',
    '.env.*',
    '!.env.example',
    '*.lock',
];

async function installSkill(client, skillId) {
    // 1. Get Metadata
    const res = await client.get(`/skills/${encodeURIComponent(skillId)}`);
    const skill = res.data;

    // 2. Determine Install Path
    const baseDir = process.env.OPENCLAW_INSTALL_DIR || 
                    (process.env.OPENCLAW_HOME ? path.join(process.env.OPENCLAW_HOME, '.openclaw') : path.join(os.homedir(), '.openclaw'));
    
    // Use unique folder name: owner__name
    const folderName = skill.id.replace('/', '__');
    const installDir = path.join(baseDir, 'skills', folderName);
    
    if (fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true });
    }
    fs.mkdirSync(installDir, { recursive: true });

    // 2.5 Restore Files
    if (skill.files) {
        let filesMap = {};
        try {
            filesMap = typeof skill.files === 'string' ? JSON.parse(skill.files) : skill.files;
        } catch (e) {}

        for (const [relPath, content] of Object.entries(filesMap)) {
            // Prevent path traversal
            if (relPath.includes('..')) continue;

            const targetPath = path.join(installDir, relPath);
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.writeFileSync(targetPath, content);
        }
    }

    // 3. Write SKILL.md
    let metadata = {};
    if (skill.metadata) {
        try {
            metadata = JSON.parse(skill.metadata);
        } catch (e) {
            // Ignore parsing error
        }
    }

    const frontmatterData = {
        id: skill.id,
        owner_id: skill.owner_id,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        icon: skill.icon,
        author: skill.owner_name,
    };
    if (Object.keys(metadata).length > 0) {
        frontmatterData.metadata = metadata;
    }

    const frontmatter = matter.stringify(skill.readme || '', frontmatterData);
    const targetFile = path.join(installDir, 'SKILL.md');
    fs.writeFileSync(targetFile, frontmatter);

    return { installDir, version: skill.version };
}

/**
 * 创建 ignore 实例，加载内置规则 + .clawignore / .gitignore
 */
function createIgnoreFilter(baseDir) {
    const ig = ignore();

    // 内置排除规则
    ig.add(BUILTIN_IGNORE_RULES);

    // 优先读取 .clawignore，回退 .gitignore
    const clawignorePath = path.join(baseDir, '.clawignore');
    const gitignorePath = path.join(baseDir, '.gitignore');

    if (fs.existsSync(clawignorePath)) {
        ig.add(fs.readFileSync(clawignorePath, 'utf8'));
    } else if (fs.existsSync(gitignorePath)) {
        ig.add(fs.readFileSync(gitignorePath, 'utf8'));
    }

    return ig;
}

// 递归收集目录下所有文件（支持 .clawignore 排除）
function collectFiles(dir, baseDir = dir, ig = null) {
    if (!ig) {
        ig = createIgnoreFilter(baseDir);
    }

    const files = {};
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        // 使用 ignore 规则判断是否排除
        if (ig.ignores(relativePath)) {
            continue;
        }
        
        if (entry.isDirectory()) {
            Object.assign(files, collectFiles(fullPath, baseDir, ig));
        } else {
            // 跳过二进制文件和过大的文件
            const ext = path.extname(entry.name).toLowerCase();
            const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.zip', '.tar', '.gz'];
            if (binaryExts.includes(ext)) continue;
            
            const stats = fs.statSync(fullPath);
            if (stats.size > 100 * 1024) continue; // 跳过超过 100KB 的文件
            
            try {
                files[relativePath] = fs.readFileSync(fullPath, 'utf8');
            } catch (e) {
                // 跳过无法读取的文件
            }
        }
    }
    return files;
}

export default function(program) {
  const skill = program.command('skill').description('Manage skills');

  skill
    .command('publish')
    .description('Publish current directory as a skill')
    .action(async () => {
      const spinner = ora('Reading skill metadata...').start();
      
      try {
        const readmePath = path.join(process.cwd(), 'SKILL.md');
        if (!fs.existsSync(readmePath)) {
          throw new Error('SKILL.md not found in current directory');
        }

        const fileContent = fs.readFileSync(readmePath, 'utf8');
        const { data, content } = matter(fileContent);

        if (!data.name || !data.description) {
          throw new Error('SKILL.md missing required frontmatter (name, description)');
        }

        // Handle nested metadata
        let icon = data.icon;
        let metadata = data.metadata;

        // Try to extract icon from metadata if not present
        if (!icon && metadata && metadata.clawdbot && metadata.clawdbot.emoji) {
            icon = metadata.clawdbot.emoji;
        }

        // 从当前目录名生成 skill_id（用于安装命令和目录）
        // name 字段作为显示名称（可中文）
        const dirName = path.basename(process.cwd());
        // 确保目录名是合法的 ASCII 字符
        const skillId = dirName
          .replace(/[^a-zA-Z0-9_-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase() || 'skill';

        // 收集目录下所有文件（应用 .clawignore 排除规则）
        spinner.text = 'Collecting files...';
        const files = collectFiles(process.cwd());
        
        // README.md 优先作为技能介绍，回退到 SKILL.md 正文
        let readmeContent = content;
        const readmeMdPath = path.join(process.cwd(), 'README.md');
        if (fs.existsSync(readmeMdPath)) {
            readmeContent = fs.readFileSync(readmeMdPath, 'utf8');
        }

        spinner.text = 'Publishing to OpenClaw...';
        
        const client = getClient();
        const res = await client.post('/skills', {
          skill_id: skillId,  // 新增：用于安装命令的 ID
          name: data.name,    // 显示名称（可中文）
          description: data.description,
          version: data.version,
          icon: icon,
          metadata: JSON.stringify(metadata), // Send as JSON string
          readme: readmeContent,
          files: JSON.stringify(files)
        });

        spinner.succeed(chalk.green(`Skill published: ${res.data.id} (${Object.keys(files).length} files)`));
        if (res.data.status === 'pending') {
          console.log(chalk.yellow('Your skill is pending review by administrators.'));
        }
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  skill
    .command('list')
    .description('List available skills')
    .action(async () => {
      const spinner = ora('Fetching skills...').start();
      try {
        const client = getClient();
        const res = await client.get('/skills');
        spinner.stop();

        if (res.data.length === 0) {
          console.log('No skills found.');
          return;
        }

        res.data.forEach(s => {
          console.log(`${chalk.bold(s.name)} (${s.id}) - ${s.description}`);
        });
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  skill
    .command('install <id>')
    .description('Install a skill by ID (e.g. official/openclaw-cn)')
    .action(async (id) => {
      // Auto-prefix 'official/' if no owner specified
      if (!id.includes('/')) {
        id = `official/${id}`;
      }

      const spinner = ora(`Installing ${id}...`).start();
      try {
        const client = getClient();
        const { installDir } = await installSkill(client, id);
        spinner.succeed(chalk.green(`Installed to ${installDir}`));
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  skill
    .command('update [id]')
    .description('Update installed skills')
    .action(async (id) => {
      const spinner = ora('Checking for updates...').start();
      try {
        const client = getClient();
        const baseDir = process.env.OPENCLAW_INSTALL_DIR || 
                        (process.env.OPENCLAW_HOME ? path.join(process.env.OPENCLAW_HOME, '.openclaw') : path.join(os.homedir(), '.openclaw'));
        const skillsDir = path.join(baseDir, 'skills');

        if (!fs.existsSync(skillsDir)) {
          spinner.info('No skills installed.');
          return;
        }

        // Find skills to update
        const skillsToUpdate = [];
        if (id) {
           // Update specific skill
           if (!id.includes('/')) id = `official/${id}`;
           skillsToUpdate.push(id);
        } else {
           // Scan all skills
           const entries = fs.readdirSync(skillsDir);
           for (const entry of entries) {
               const skillPath = path.join(skillsDir, entry);
               const readmePath = path.join(skillPath, 'SKILL.md');
               if (fs.existsSync(readmePath)) {
                   const content = fs.readFileSync(readmePath, 'utf8');
                   const { data } = matter(content);
                   if (data.id) {
                       skillsToUpdate.push(data.id);
                   }
               }
           }
        }

        if (skillsToUpdate.length === 0) {
            spinner.info('No installed skills found with valid ID metadata.');
            return;
        }

        let updatedCount = 0;
        for (const skillId of skillsToUpdate) {
            spinner.text = `Checking ${skillId}...`;
            try {
                // Get remote version
                const res = await client.get(`/skills/${encodeURIComponent(skillId)}`);
                const remoteSkill = res.data;
                
                // Get local version
                // We need to find the local path again because we might have scanned it, or user provided ID
                const folderName = skillId.replace('/', '__');
                const localReadme = path.join(skillsDir, folderName, 'SKILL.md');
                
                let localVersion = '0.0.0';
                if (fs.existsSync(localReadme)) {
                    const { data } = matter(fs.readFileSync(localReadme, 'utf8'));
                    localVersion = data.version || '0.0.0';
                }

                if (remoteSkill.version !== localVersion) {
                    spinner.text = `Updating ${skillId} (${localVersion} -> ${remoteSkill.version})...`;
                    await installSkill(client, skillId);
                    spinner.succeed(chalk.green(`Updated ${skillId} to v${remoteSkill.version}`));
                    updatedCount++;
                } else {
                    if (id) spinner.succeed(`${skillId} is already up to date (v${localVersion})`);
                }
            } catch (e) {
                spinner.fail(chalk.red(`Failed to update ${skillId}: ${e.message}`));
            }
        }

        if (!id && updatedCount === 0) {
            spinner.succeed('All skills are up to date.');
        }

      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  skill
    .command('review <id>')
    .description('Review a skill (Admin only)')
    .option('--action <action>', 'Action to take (approve/reject)', 'approve')
    .option('--note <note>', 'Review note')
    .action(async (id, options) => {
      if (!['approve', 'reject'].includes(options.action)) {
        console.error(chalk.red('Invalid action. Use approve or reject.'));
        return;
      }

      const spinner = ora(`Reviewing ${id}...`).start();
      try {
        const client = getClient();
        const res = await client.post(`/admin/skills/${encodeURIComponent(id)}/review`, {
          action: options.action,
          note: options.note
        });
        spinner.succeed(chalk.green(res.data.message));
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });
}
