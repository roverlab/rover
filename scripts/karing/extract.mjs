#!/usr/bin/env node
/**
 * Karing 规则集生成 - 合并为一步
 * 两个主要方法: fetchDirectories (抓取目录) | generateJson (生成 JSON)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

const outputPath =  join(ROOT, "data/rulesets/singbox.json");

// 启动时加载映射到内存，避免运行时读盘
const MAPPING = JSON.parse(readFileSync(join(__dirname, "name-mapping.json"), "utf-8"));

const BASE_URL = "https://api.github.com/repos/KaringX/karing-ruleset/contents";
const GIT_API = "https://api.github.com/repos/KaringX/karing-ruleset/git";
const BRANCH = "sing";
const RAW_BASE = "https://raw.githubusercontent.com/KaringX/karing-ruleset/sing";

const DIRS = ["ACL4SSR", "geo/geoip", "geo/geosite"];
/** GitHub Contents API 目录列表限制 1000 条，geo/geosite 超限会截断，需用 Git Trees API */
const DIRS_USE_TREE = ["geo/geoip", "geo/geosite"];

const PART_TRANSLATIONS = {
  category: "分类", ads: "广告", ad: "广告", all: "全部", cn: "中国", ir: "伊朗",
  ru: "俄罗斯", uk: "英国", jp: "日本", mm: "缅甸", bank: "银行", gov: "政府",
  media: "媒体", news: "新闻", education: "教育", forums: "论坛", insurance: "保险",
  bourse: "股市", payment: "支付", shopping: "购物", tech: "科技", travel: "旅游",
  social: "社交", games: "游戏", game: "游戏", scholar: "学术", dev: "开发者",
  entertainment: "娱乐", finance: "金融", ecommerce: "电商", companies: "企业",
  proxy: "代理", tunnels: "隧道", remote: "远程", control: "控制", porn: "成人",
  ai: "AI", chat: "聊天", cdn: "CDN", doh: "DoH", ipfs: "IPFS", cryptocurrency: "加密货币",
  antivirus: "杀毒", anticensorship: "反审查", automobile: "汽车", blog: "博客",
  documents: "文档", electronic: "电子", emby: "Emby", enhance: "增强", gaming: "游戏",
  enterprise: "企业", query: "查询", platform: "平台", food: "食品", hospital: "医院",
  httpdns: "HTTP DNS", ip: "IP", geo: "地理", detect: "检测", logistics: "物流",
  mooc: "慕课", netdisk: "网盘", network: "网络", security: "安全", novel: "小说",
  ntp: "NTP", number: "号码", verification: "验证", olympiad: "奥赛", informatics: "信息学",
  orgs: "组织", outsource: "外包", password: "密码", management: "管理", pt: "PT",
  public: "公开", tracker: "追踪", retail: "零售", speedtest: "测速", tm: "商标",
  urlshortner: "短链接", voip: "VoIP", vpnservices: "VPN服务", web: "网页",
  archive: "归档", wiki: "维基", collaborate: "协作", communication: "通信",
  container: "容器", ddns: "DDNS", android: "安卓", app: "应用", download: "下载",
  browser: "浏览器", cas: "博彩", acg: "ACG", com: "商业", mobile: "移动",
  repair: "维修", securities: "证券", "!cn": "非中国",
};

/**
 * 抓取目录 - 从 GitHub API 获取指定目录下的 .srs 文件列表
 * geo/geosite 等目录超过 Contents API 的 1000 条限制，改用 Git Trees API 获取完整列表
 * @param {string[]} dirs - 目录路径数组
 * @returns {Promise<Array<{id, name, url, path}>>} 原始规则集列表
 */
async function fetchDirectories(dirs = DIRS) {
  const fetchJson = (url) =>
    fetch(url, { headers: { Accept: "application/vnd.github.v3+json" } }).then((r) => r.json());

  let lastUpdate;
  try {
    const [commits] = await fetchJson(
      `https://api.github.com/repos/KaringX/karing-ruleset/commits?per_page=1&sha=${BRANCH}`
    );
    const d = new Date(commits?.commit?.committer?.date || Date.now());
    lastUpdate = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  } catch {
    const n = new Date();
    lastUpdate = `${n.getFullYear()}/${n.getMonth() + 1}/${n.getDate()} ${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:${String(n.getSeconds()).padStart(2, "0")}`;
  }

  const all = [];

  // 对超限目录使用 Git Trees API 获取完整列表（Contents API 限制 1000 条）
  const treeDirs = dirs.filter((d) => DIRS_USE_TREE.includes(d));
  if (treeDirs.length > 0) {
    const [commits] = await fetchJson(
      `https://api.github.com/repos/KaringX/karing-ruleset/commits?per_page=1&sha=${BRANCH}`
    );
    const treeSha = commits?.commit?.tree?.sha;
    if (treeSha) {
      const treeRes = await fetchJson(`${GIT_API}/trees/${treeSha}?recursive=1`);
      const tree = treeRes?.tree || [];
      for (const dir of treeDirs) {
        const prefix = dir.endsWith("/") ? dir : dir + "/";
        const items = tree.filter(
          (e) => e.type === "blob" && e.path?.startsWith(prefix) && e.path.endsWith(".srs")
        );
        for (const e of items) {
          const path = e.path;
          const name = path.slice(path.lastIndexOf("/") + 1, -4);
          all.push({
            id: name,
            name,
            url: `${RAW_BASE}/${path}`,
            path,
            last_update: lastUpdate,
          });
        }
        console.log(`  ${dir}: ${items.length} 个 .srs (Git Trees API)`);
      }
    }
  }

  // 其余目录用 Contents API
  const contentsDirs = dirs.filter((d) => !DIRS_USE_TREE.includes(d));
  for (const dir of contentsDirs) {
    const contents = await fetchJson(`${BASE_URL}/${dir}?ref=${BRANCH}`);
    const items = (Array.isArray(contents) ? contents : []).filter(
      (x) => x.type === "file" && (x.name || "").endsWith(".srs")
    );
    for (const item of items) {
      const path = item.path || "";
      all.push({
        id: (item.name || "").slice(0, -4),
        name: (item.name || "").slice(0, -4),
        url: item.download_url || `${RAW_BASE}/${path}`,
        path,
        last_update: lastUpdate,
      });
    }
    console.log(`  ${dir}: ${items.length} 个 .srs`);
  }

  return all;
}

/**
 * 生成 JSON - 全内存处理：翻译中文、添加前缀，最后一次性写入
 * @param {Array} raw - fetchDirectories 返回的原始数据
 * @param {Object} options - { outputPath, mapping }
 * @returns {Array} 生成的规则集数组
 */
function generateJson(raw, options = {}) {
  const mapping = options.mapping ?? MAPPING;

  const translatePart = (p) => PART_TRANSLATIONS[p?.toLowerCase()] ?? PART_TRANSLATIONS[p] ?? p;
  const translateCategory = (id) => {
    if (!id.startsWith("category-")) return null;
    return id.replace("@", "-").split("-").slice(1).filter(Boolean)
      .map((p) => (p.startsWith("!") ? "(非" + translatePart(p.slice(1)) + ")" : translatePart(p)))
      .join("") || id;
  };
  const getChineseName = (id) =>
    mapping[id] ?? mapping[id?.toLowerCase()] ?? translateCategory(id) ??
    (id.includes("@") ? id.split("@").map(translatePart).join("") : null) ??
    (id.includes("-") ? id.split("-").map(translatePart).join("") : null) ?? id;

  const getPrefix = (path) =>
    path.startsWith("ACL4SSR/Ruleset/") ? "acl" :
    path.startsWith("geo/geoip/") ? "geoip" :
    path.startsWith("geo/geosite/") ? "geosite" : "acl";

  const rulesets = raw.map((r) => {
    const id = `${getPrefix(r.path)}:${r.id}`;
    const path = id.replace(":", "/") + ".srs";
    return {
      id,
      name: getChineseName(r.id),
      url: r.url,
      type: "clash",
      enabled: true,
      path,
      last_update: r.last_update,
    };
  });

  rulesets.sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));

  writeFileSync(outputPath, JSON.stringify(rulesets, null, 2), "utf-8");

  const acl = rulesets.filter((x) => x.id.startsWith("acl:")).length;
  const geoip = rulesets.filter((x) => x.id.startsWith("geoip:")).length;
  const geosite = rulesets.filter((x) => x.id.startsWith("geosite:")).length;

  console.log(`\n生成完成: ${rulesets.length} 条 (acl: ${acl} | geoip: ${geoip} | geosite: ${geosite})`);

  return rulesets;
}

async function main() {
  console.log("抓取目录...\n");
  const raw = await fetchDirectories();
  console.log("\n生成 JSON...\n");
  generateJson(raw);
}

main().catch(console.error);

export { fetchDirectories, generateJson };
