import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.mjs')).sort();let failed=0;
for(const file of files){const result=spawnSync(process.execPath,[path.join(root,'tests',file)],{cwd:root,encoding:'utf8'});console.log((result.status===0?'PASS ':'FAIL ')+file);if(result.status!==0){failed++;console.error(result.stdout,result.stderr);}}
console.log(`${files.length-failed}/${files.length} test scripts passed`);process.exitCode=failed?1:0;
