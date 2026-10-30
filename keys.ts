#!/usr/bin/env node
// litellm-keytool.ts — mint / disable / enable / remove a per-app LiteLLM virtual key.
//
//   node litellm-keytool.ts generate opencode
//   node litellm-keytool.ts block    opencode   # keeps spend history, reversible
//   node litellm-keytool.ts unblock  opencode
//   node litellm-keytool.ts delete   opencode   # hard delete, destroys history
//
// env: LITELLM_MASTER_KEY (required), LITELLM_BASE_URL, LITELLM_ENV_FILE, LITELLM_KEY_TYPE

import { existsSync, readFileSync } from 'node:fs';

type Action = 'generate' | 'block' | 'unblock' | 'delete';

interface ApiErrorShape {
	error?: { message?: string };
	detail?: unknown;
}

interface GenerateResponse {
	key?: string;
	token?: string;
}

interface KeyListEntry {
	token?: string;
	key?: string;
	hash?: string;
	token_id?: string;
}

interface KeyListResponse {
	keys?: Array<KeyListEntry | string>;
	data?: Array<KeyListEntry | string>;
}

interface DeleteResponse {
	deleted_keys?: string[];
	keys?: string[];
}

const ALIAS_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ACTIONS: readonly Action[] = ['generate', 'block', 'unblock', 'delete'];
const TIMEOUT_MS = 15_000;

function fail(msg: string, code = 1): never {
	console.error(`error: ${msg}`);
	process.exit(code);
}

function usage(code = 2): never {
	console.error(`usage: node ${process.argv[1]} <generate|block|unblock|delete> <app>

  generate  create a key scoped to <app>; prints the key to stdout
  block     disable every key with key_alias <app>, keeping spend history
  unblock   re-enable every key with key_alias <app>
  delete    hard-delete every key with key_alias <app> (destroys history)

env:
  LITELLM_MASTER_KEY  required
  LITELLM_BASE_URL    default http://127.0.0.1:4000
  LITELLM_ENV_FILE    default .env ("" to skip)
  LITELLM_KEY_TYPE    default llm_api`);
	process.exit(code);
}

// Minimal .env reader: no ${VAR} interpolation, no backticks, no code execution.
function loadEnv(file: string): void {
	if (!file || !existsSync(file)) return;
	for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const name = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
		if (value.length >= 2 &&
			((value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'")))) {
			value = value.slice(1, -1);
		}
		if (!(name in process.env)) process.env[name] = value;
	}
}

async function apiRequest<T>(
	base: string,
	method: 'GET' | 'POST',
	path: string,
	masterKey: string,
	payload?: unknown,
): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${base}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${masterKey}`,
				...(payload ? { 'Content-Type': 'application/json' } : {}),
			},
			...(payload ? { body: JSON.stringify(payload) } : {}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (e) {
		fail(`request to ${base}${path} failed: ${(e as Error).message}`);
	}

	const text = await res.text();
	let data: unknown;
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		fail(`non-JSON response (HTTP ${res.status}): ${text.slice(0, 500)}`);
	}

	if (!res.ok) {
		const shaped = data as ApiErrorShape;
		const msg =
			shaped?.error?.message ??
			(shaped?.detail !== undefined ? String(shaped.detail) : text.slice(0, 500));
		fail(`HTTP ${res.status} on ${path}: ${msg}`);
	}
	return data as T;
}

// Resolve key_alias -> identifiers accepted by /key/block, /key/unblock, /key/delete.
// Returns both the token and the hash when present, so a masked token can be retried.
function candidatesForAlias(base: string, app: string, masterKey: string): Promise<string[][]> {
	const q = new URLSearchParams({
		key_alias: app,
		return_full_object: 'true',
		size: '100',
	}).toString();

	return apiRequest<KeyListResponse>(base, 'GET', `/key/list?${q}`, masterKey).then((data) => {
		const entries = data.keys ?? data.data ?? [];
		const out: string[][] = [];
		for (const e of entries) {
			if (typeof e === 'string') {
				if (e) out.push([e]);
				continue;
			}
			const ids = [e.token, e.key, e.hash].filter(
				(v): v is string => typeof v === 'string' && v.length > 0,
			);
			if (ids.length) out.push([...new Set(ids)]);
		}
		return out;
	});
}

async function toggle(
	base: string,
	app: string,
	masterKey: string,
	verb: 'block' | 'unblock',
): Promise<void> {
	const candidates = await candidatesForAlias(base, app, masterKey);
	if (!candidates.length) {
		fail(`no keys found with key_alias=${app}; nothing to ${verb}`);
	}

	const path = verb === 'block' ? '/key/block' : '/key/unblock';
	let changed = 0;

	for (const ids of candidates) {
		let lastErr: unknown;
		let done = false;

		for (const id of ids) {
			try {
				const data = await apiRequest<Record<string, unknown>>(base, 'POST', path, masterKey, {
					key: id,
				});
				const state = 'blocked' in data ? data.blocked : 'ok';
				console.error(`${verb}ed key_alias=${app} id=${id.slice(0, 12)}… blocked=${state}`);
				console.log(id);
				changed += 1;
				done = true;
				break;
			} catch (e) {
				lastErr = e; // try the next identifier (e.g. hash when token is masked)
			}
		}

		if (!done) {
			console.error(`error: could not ${verb} a key for ${app}: ${(lastErr as Error)?.message ?? lastErr}`);
		}
	}

	if (!changed) fail(`no key could be ${verb}ed for ${app}`);
	console.error(`${verb}ed ${changed} key(s) — spend history retained`);
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	if (!argv.length) usage(2);
	if (['-h', '--help', 'help'].includes(argv[0]!)) usage(0);

	const [action, app, ...rest] = argv;
	if (!action || !app) usage(2);
	if (rest.length) fail(`unexpected arguments: ${rest.join(' ')}`, 2);
	if (!ACTIONS.includes(action as Action)) {
		fail(`unknown action ${JSON.stringify(action)}; expected: ${ACTIONS.join(', ')}`, 2);
	}
	if (!ALIAS_RE.test(app)) {
		fail(`app name ${JSON.stringify(app)} must be lowercase alnum with single hyphens (e.g. opencode)`);
	}

	loadEnv(process.env.LITELLM_ENV_FILE ?? '.env');

	const masterKey = process.env.LITELLM_MASTER_KEY;
	if (!masterKey) fail('LITELLM_MASTER_KEY is not set — export it or put it in your .env');

	const base = (process.env.LITELLM_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/+$/, '');

	switch (action as Action) {
		case 'generate': {
			const keyType = process.env.LITELLM_KEY_TYPE ?? 'llm_api';
			const data = await apiRequest<GenerateResponse>(base, 'POST', '/key/generate', masterKey, {
				key_alias: app,
				key_type: keyType,
				metadata: { app, allowed_passthrough_routes: ["/phala", "/openrouter"] },
				// models intentionally omitted: all proxy models, including ones added later
			});
			const key = data.key ?? data.token;
			if (!key) fail(`no key in response: ${JSON.stringify(data).slice(0, 500)}`);
			console.error(`created key_alias=${app} (key_type=${keyType}, models=all)`);
			console.log(key);
			break;
		}

		case 'block':
		case 'unblock':
			await toggle(base, app, masterKey, action as 'block' | 'unblock');
			break;

		case 'delete': {
			const candidates = await candidatesForAlias(base, app, masterKey);
			if (!candidates.length) fail(`no keys found with key_alias=${app}; nothing deleted`);

			const data = await apiRequest<DeleteResponse>(base, 'POST', '/key/delete', masterKey, {
				key_aliases: [app],
			});
			const deleted = data.deleted_keys ?? data.keys ?? candidates.map((c) => c[0]!);
			console.error(`DELETED ${deleted.length} key(s) with key_alias=${app} — spend history destroyed`);
			console.log(deleted.join('\n'));
			break;
		}
	}
}

main().catch((e: unknown) => {
	fail((e as Error)?.stack ?? String(e));
});
