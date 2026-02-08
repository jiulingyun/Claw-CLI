import chalk from 'chalk';
import ora from 'ora';
import { getClient, formatError } from '../config.js';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

marked.setOptions({
  renderer: new TerminalRenderer()
});

export default function(program) {
  const doc = program.command('doc').description('Search and read documentation');

  doc
    .command('search <query>')
    .description('Search documentation')
    .action(async (query) => {
      const spinner = ora('Searching...').start();
      try {
        const client = getClient();
        const res = await client.get(`/docs/search`, { params: { q: query } });
        spinner.stop();

        if (res.data.length === 0) {
          console.log('No results found.');
          return;
        }

        res.data.forEach(item => {
          console.log(chalk.bold.cyan(item.title));
          console.log(chalk.gray(item.path));
          console.log(item.excerpt);
          console.log('');
        });
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });

  doc
    .command('read <path>')
    .description('Read a documentation page')
    .action(async (path) => {
      const spinner = ora('Loading document...').start();
      try {
        const client = getClient();
        const res = await client.get(`/docs/read`, { params: { path } });
        spinner.stop();

        console.log(marked(res.data.content));
      } catch (err) {
        spinner.fail(chalk.red(formatError(err)));
      }
    });
}
