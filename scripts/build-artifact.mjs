// dist/index.html（1 枚にまとめたビルド結果）を claude.ai アーティファクトの形式に変換する。
// アーティファクトは <!doctype>/<html>/<head>/<body> を自動で付けるので、中身だけを書き出す。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const REACT_VERSION = '18.3.1';
const html = readFileSync('dist/index.html', 'utf8');

const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.trim());
if (!scripts.length) throw new Error('script が見つかりません');

const out = `<title>CharaCardArena</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap">
<style>
${styles}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT_VERSION}/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT_VERSION}/umd/react-dom.production.min.js"></script>
<script>
${scripts.map((s) => s.replace(/<\/script/gi, '<\\/script')).join('\n')}
</script>
`;
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/characard-arena.html', out);
console.log(`dist-artifact/characard-arena.html (${(out.length / 1024).toFixed(1)} KB)`);
