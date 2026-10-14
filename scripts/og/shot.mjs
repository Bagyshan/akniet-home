import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
const [,, url, out] = process.argv;
const chrome = spawn('google-chrome', ['--headless=new','--hide-scrollbars','--allow-file-access-from-files','--remote-debugging-port=9335','--window-size=1200,630','--user-data-dir=/tmp/claude-1000/cdp-prof3','about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9335/json')).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pending = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url }); await sleep(3500);
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
writeFileSync(out, Buffer.from(shot.result.data, 'base64')); ws.close(); chrome.kill();
