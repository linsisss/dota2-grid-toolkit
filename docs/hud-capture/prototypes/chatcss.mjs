// The C1/F-chat edit of Valve's chat.css: the chat target and the message spans inherit the line's font-size.
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('/home/code/gridstudio/repo/assets/dota-hud/panorama/styles/chat.css', 'utf8');
const edits = [
  [/(\n\.ChatTarget \{\n)    font-size: 14px;\n/, '$1'],
  [/(\nDOTAChat#HudChat \.ChatTarget \{\n)    font-size: 18px;\n/, '$1'],
  [/(\nDOTAChat#HudChat \.GameAllChat,\nDOTAChat#HudChat \.GameAlliesChat,\nDOTAChat#HudChat \.GameCoachingChat,\nDOTAChat#HudChat \.HLTVSpectatorChannelChat \{\n    font-weight: bold;\n)    font-size: 18px;\n/, '$1']
];
let out = src;
for (const [re, to] of edits) { const n = (out.match(new RegExp(re.source, 'g')) || []).length; if (n !== 1) throw new Error(`${re}: ${n} matches`); out = out.replace(re, to); }
writeFileSync('out/chat-c1.css', out);
console.log('removed', src.length - out.length, 'bytes; 3 edits ok');
