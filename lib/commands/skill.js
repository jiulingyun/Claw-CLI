import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import chalk from 'chalk';
import ora from 'ora';
import { getClient, formatError } from '../config.js';
import os from 'os';

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

        spinner.text = 'Publishing to OpenClaw...';
        
        const client = getClient();
        const res = await client.post('/skills', {
          name: data.name,
          description: data.description,
          version: data.version,
          icon: icon,
          metadata: JSON.stringify(metadata), // Send as JSON string
          readme: content
        });

        spinner.succeed(chalk.green(`Skill published: ${res.data.id}`));
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
