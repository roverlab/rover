# Karing 规则集生成脚本

从 [KaringX/karing-ruleset](https://github.com/KaringX/karing-ruleset) (sing 分支) 提取规则集并生成 JSON 文件。

## 两个主要方法

| 方法 | 说明 |
|-----|------|
| `fetchDirectories(dirs?)` | 抓取目录 - 从 GitHub API 获取指定目录下的 .srs 文件列表 |
| `generateJson(raw, options?)` | 生成 JSON - 翻译中文、添加前缀，输出 karing_rulesets.json 和 karing_rulesets2.json |

## 用法

```bash
npm run karing
# 或
node scripts/karing/extract.mjs
```

## 作为模块使用

```js
import { fetchDirectories, generateJson } from "./scripts/karing/extract.mjs";

const raw = await fetchDirectories();           // 抓取目录
const result = generateJson(raw, {              // 生成 JSON
  mappingPath: "./name-mapping.json",
  outputPath: "./karing_rulesets.json",
  outputPath2: "./karing_rulesets2.json",
});
```

## 输出

- **karing_rulesets.json** - 无前缀，中文 name
- **karing_rulesets2.json** - 带前缀 (acl:/geoip:/geosite:)

## 前缀规则

| 路径 | 前缀 |
|-----|------|
| ACL4SSR/Ruleset/ | acl |
| geo/geoip/ | geoip |
| geo/geosite/ | geosite |
