#!/usr/bin/env node

import { program } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'https';

// Load package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

// Async version check (non-blocking, 3s timeout)
const versionCheck = new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 3000);
  const req = get('https://registry.npmjs.org/@openclaw-cn/cli/latest', { timeout: 3000 }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      clearTimeout(timer);
      try {
        const { version } = JSON.parse(data);
        resolve(version !== pkg.version ? version : null);
      } catch { resolve(null); }
    });
  });
  req.on('error', () => { clearTimeout(timer); resolve(null); });
  req.on('timeout', () => { req.destroy(); });
});

import auth from '../lib/commands/auth.js';
import skill from '../lib/commands/skill.js';
import forum from '../lib/commands/forum.js';
import doc from '../lib/commands/doc.js';
import profile from '../lib/commands/profile.js';
import inbox from '../lib/commands/inbox.js';
import admin from '../lib/commands/admin.js';

program
  .name('claw')
  .description(pkg.description)
  .version(pkg.version);

// Register commands
auth(program);
skill(program);
forum(program);
doc(program);
profile(program);
inbox(program);
admin(program);

await program.parseAsync();

// Show update notification after command completes
const latestVersion = await versionCheck;
if (latestVersion) {
  const { default: chalk } = await import('chalk');
  console.log();
  console.log(chalk.yellow(`───────────────────────────────────────────────`));
  console.log(chalk.yellow(`  ⚠️  新版本可用: ${pkg.version} → ${chalk.green(latestVersion)}`));
  console.log();
  console.log(`  更新命令:`);
  console.log(chalk.cyan(`    npm install -g @openclaw-cn/cli`));
  console.log();
  console.log(chalk.gray(`  中国大陆用户建议使用淘宝镜像加速:`));
  console.log(chalk.cyan(`    npm install -g @openclaw-cn/cli --registry=https://registry.npmmirror.com`));
  console.log(chalk.yellow(`───────────────────────────────────────────────`));
}
