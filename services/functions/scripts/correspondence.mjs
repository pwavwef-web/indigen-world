#!/usr/bin/env node
// Local print requests: generates both formats, never sends mail or starts a printer.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {generateLetterFiles} from '../lib/correspondence-render.js';
import {normalizeLetter,parseLetterBody,heritageSvg} from '@indigen-world/contracts/correspondence';
import {onePage,kasem,multiPage} from './correspondence-fixtures.mjs';
const args=process.argv.slice(2),outFlag=args.indexOf('--out'),output=resolve(outFlag>=0?args[outFlag+1]:'data/private/correspondence');
const letters=args.includes('--samples')?[onePage,multiPage,kasem]:[await (async()=>{const at=args.indexOf('--input');if(at<0)throw new Error('Use --input letter.json --out private-folder, or --samples --out folder.');const data=JSON.parse(await readFile(resolve(args[at+1]),'utf8'));return normalizeLetter({...data,body:typeof data.body==='string'?parseLetterBody(data.body):data.body});})()];
await mkdir(output,{recursive:true});
for(const letter of letters){const files=await generateLetterFiles(letter);for(const kind of ['docx','pdf']){const path=resolve(output,`${files.filename}.${kind}`);await writeFile(path,files[kind]);console.log(`${kind==='docx'?'Download Word':'Download PDF'}: ${path}`);}}
if(args.includes('--samples'))await writeFile(resolve(output,'heritage-frame.svg'),heritageSvg());
