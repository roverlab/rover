import { clashRuleSetToSingbox } from './electron/clash-rule-set';

// 测试数据
const testPayload = `payload:
  - '+.0.avmarket.rs'
  - 'baidu.com'
  - '+.0.myikas.com'
  - '+.0.net.easyjet.com'
  - '+.0.nextyourcontent.com'
  - '+.0.www.cheetahhowevertowardsfrom.com'
  - '+.0.www.m657srtusw1sn3-7lol8-5.xyz'
  - '+.0.www.som4okn1qku1r9p0ul.xyz'
  - '+.000c34b44b.1c3139f0ca.com'
  - '+.0014b04291.com'
  - '+.0019x.com'
  - '+.002777.xyz'
  - '+.003store.com'
  - '+.00404850.xyz'
  - '+.00427011ae.com'
  - '+.006.freecounters.co.uk'
  - '+.00609c257b.com'
  - '+.00771944.xyz'
  - '+.00857731.xyz'`;


const testPayload2 = `payload:
# NAME: Microsoft
  - DOMAIN,vsmarketplacebadge.apphb.com
  - DOMAIN-SUFFIX,1drv.ms
  - DOMAIN-SUFFIX,21vbc.com
  - DOMAIN-SUFFIX,21vbluecloud.com
  - DOMAIN-SUFFIX,21vbluecloud.net
  - DOMAIN-SUFFIX,a-msedge.net
  - DOMAIN-SUFFIX,a1158.g.akamai.net
  - DOMAIN-SUFFIX,a122.dscg3.akamai.net
  - DOMAIN-SUFFIX,a767.dscg3.akamai.net
  - DOMAIN-SUFFIX,aadrm.cn
  - DOMAIN-SUFFIX,aadrm.com
  - DOMAIN-SUFFIX,acompli.com`;

  const testPayload3 = `payload:
  - '91.105.192.0/23'
  - '91.108.4.0/22'
  - '91.108.8.0/21'
  - '91.108.16.0/21'
  - '91.108.56.0/22'
  - '95.161.64.0/20'
  - '149.154.160.0/20'
  - '185.76.151.0/24'
  - '2001:67c:4e8::/48'
  - '2001:b28:f23c::/47'
  - '2001:b28:f23f::/48'
  - '2a0a:f280::/32'`;


console.log('开始测试rule provider转换为singbox配置...');
console.log('输入payload:');
console.log('\n' + '='.repeat(80));

try {
  const result = clashRuleSetToSingbox(testPayload3);
  console.log('转换成功！singbox配置:');
  console.log(JSON.stringify(result, null, 2));
  
  console.log('\n' + '-'.repeat(80));
  console.log('转换结果摘要:');
  console.log(`版本: ${result.version}`);
  console.log(`规则数量: ${result.rules.length}`);
  
  result.rules.forEach((rule, index) => {
    console.log(`规则 ${index + 1}:`);
    Object.keys(rule).forEach(key => {
      if (Array.isArray(rule[key]) && rule[key].length > 0) {
        console.log(`  ${key}: ${rule[key].length} 个条目`);
        // 显示前5个作为示例
        const samples = rule[key].slice(0, 5);
        console.log(`  示例: ${samples.join(', ')}${rule[key].length > 5 ? '...' : ''}`);
      }
    });
  });
} catch (error) {
  console.error('转换失败:', (error as Error).message);
  console.error('详细错误:', error);
}