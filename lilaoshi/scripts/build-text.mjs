import {build} from 'esbuild';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
// Serve Sonner's own CSS as a local file instead of injecting a blocked inline style.
await build({entryPoints:['src/text-motion.jsx'],bundle:true,minify:true,format:'iife',define:{'process.env.NODE_ENV':'"production"'},outfile:'web/text-motion.js',legalComments:'eof',plugins:[{name:'external-sonner-css',setup(build){build.onLoad({filter:/sonner\/dist\/index\.mjs$/},async({path})=>{let source=await readFile(path,'utf8');const match=source.match(/__insertCSS\(("(?:\\.|[^"\\])*")\);/);if(!match)throw Error('Sonner CSS extraction needs review');await writeFile('web/sonner.css',JSON.parse(match[1]));return {contents:source.replace(match[0],''),loader:'js'}})}}]});
await copyFile('node_modules/sonner/LICENSE.md','web/sonner.LICENSE.txt');
