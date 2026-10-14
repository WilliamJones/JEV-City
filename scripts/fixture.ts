/** Regenerate docs/fixtures/jev-request.example.json `questions` from the server-owned builder (dev utility). */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildJevRequest } from '../src/jev/contract';
const p = 'docs/fixtures/jev-request.example.json';
const d = JSON.parse(readFileSync(p, 'utf8'));
d.questions = buildJevRequest(d.state).questions;
writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
console.log('criteria:', Object.keys(d.questions.next_action.criteria).join(', '));
