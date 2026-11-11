import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
const { positionals } = parseArgs({ allowPositionals: true });

const KEY_FILE = "./model-proxy-keys.json";

const name = positionals[0];

if (name === undefined) throw Error("must give key name");

const keys = JSON.parse(readFileSync(KEY_FILE, "utf8"));

if (keys.find((vk: any) => vk.name === name))
  throw Error(`${name} is already in the config`);

const key = "sk-vk-" + randomBytes(32).toString("hex");

keys.push({ name, key });

writeFileSync(KEY_FILE, JSON.stringify(keys, null, 2));
process.stdout.write(`\x1b]52;c;${Buffer.from(key).toString("base64")}\x07`);
console.log("Key copied to clipboard via OSC52");
