import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
const { positionals } = parseArgs({ allowPositionals: true });

const ENV_FILE = "./.env.model-proxy";
const CONFIG_FILE = "./model-proxy.json";

const name = positionals[0];

if (name === undefined) throw Error("must give key name");

const config = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));

if (config.virtual_keys.find((vk: any) => vk.name === name))
  throw Error(`${name} is already in the config`);

const key = "sk-vk-" + randomBytes(32).toString("hex");

const key_env = `VK_${name.toUpperCase()}`;

config.virtual_keys.push({ name, key_env });

writeFileSync(ENV_FILE, `${readFileSync(ENV_FILE, "utf8")}\n${key_env}=${key}`);
writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
process.stdout.write(`\x1b]52;c;${Buffer.from(key).toString("base64")}\x07`);
console.log("Key copied to clipboard via OSC52");
