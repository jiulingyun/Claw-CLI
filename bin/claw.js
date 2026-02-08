#!/usr/bin/env node

import { program } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

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

program.parse();
