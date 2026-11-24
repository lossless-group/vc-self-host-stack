// Enrich one person by social URL. Key comes from the environment, never this file:
//   set -a; source ~/.secrets; set +a; npx tsx enrich-people.ts https://linkedin.com/in/yahia-bakour
// Requires: pnpm add context.dev
import { ContextDev } from 'context.dev';

const apiKey = process.env.CONTEXT_DEV_API_KEY;
if (!apiKey) throw new Error('CONTEXT_DEV_API_KEY is not set (source ~/.secrets first)');

const client = new ContextDev({ apiKey });
const urls = process.argv.slice(2);

const response = await client.people.enrich({
	social_urls: urls.length ? urls : ['https://linkedin.com/in/yahia-bakour'],
});
console.log(JSON.stringify(response, null, 2));
