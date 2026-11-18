// 从 Poly Haven 下载 CC0 PBR 贴图（1K/2K JPG）
// 用法：node tools/fetch-textures.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('assets/textures');
fs.mkdirSync(OUT, { recursive: true });

const ASSETS = {
  concrete_wall_008: '2k',
  wood_planks: '2k',
  corrugated_iron_02: '2k',
  brick_4: '1k',
  concrete_floor_02: '2k',
  asphalt_04: '2k',
  forest_ground_05: '2k',
  grass_ground: '1k',
  snow_02: '1k',
  rock_face_03: '1k',
};

const MAPS = { Diffuse: 'diff', nor_gl: 'nor', Rough: 'rough' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const credits = ['# Poly Haven CC0 贴图', '', '以下贴图来自 https://polyhaven.com/ ，许可为 CC0。', ''];
  for (const [id, res] of Object.entries(ASSETS)) {
    const info = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
    for (const [src, suffix] of Object.entries(MAPS)) {
      const entry = info[src] && info[src][res] && info[src][res].jpg;
      if (!entry || !entry.url) {
        console.warn('missing', id, src, res);
        continue;
      }
      const file = path.join(OUT, `${id}_${suffix}.jpg`);
      if (fs.existsSync(file) && fs.statSync(file).size > 1000) {
        console.log('skip', file);
        continue;
      }
      const buf = Buffer.from(await (await fetch(entry.url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).arrayBuffer());
      fs.writeFileSync(file, buf);
      console.log('saved', file, (buf.length / 1024).toFixed(0) + 'KB');
      await sleep(120);
    }
    credits.push(`## ${id}`, `- 来源: https://polyhaven.com/a/${id}`, `- 分辨率: ${res}`, '');
  }
  fs.writeFileSync(path.join(OUT, 'CREDITS-PolyHaven.md'), credits.join('\n'));
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
