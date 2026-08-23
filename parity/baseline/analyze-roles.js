const fs=require('fs');
const R=JSON.parse(fs.readFileSync('roles.raw.json','utf8'));
const SYSTEM=['rider','picker','customer'];
const isSys=n=>SYSTEM.includes(String(n||'').toLowerCase());
console.log('total roles:', R.length, '\n');
console.log('name'.padEnd(28)+'#perms'.padEnd(8)+'default'.padEnd(9)+'system'.padEnd(8)+'first 3 permissions');
console.log('-'.repeat(105));
for(const r of R){
  const p=r.permissions||[];
  console.log(String(r.name).padEnd(28)+String(p.length).padEnd(8)+String(!!r.is_default).padEnd(9)+String(isSys(r.name)).padEnd(8)+p.slice(0,3).join(', '));
}
const nonSys=R.filter(r=>!isSys(r.name));
console.log('\n=== the questions that gate Phase B1 ===');
console.log('1. roles holding "*"                :', R.filter(r=>(r.permissions||[]).includes('*')).length);
console.log('2. non-system roles (admin-UI users):', nonSys.length, '->', nonSys.map(r=>r.name).join(', '));
console.log('   ...of those with ZERO permissions:', nonSys.filter(r=>(r.permissions||[]).length===0).map(r=>r.name).join(', ')||'(none)');
console.log('4. a role named exactly "Admin"      :', R.some(r=>r.name==='Admin'));
// permission vocabulary sanity
const all=[...new Set(R.flatMap(r=>r.permissions||[]))].sort();
const bad=all.filter(p=>p!=='*'&&!/^[a-z_]+:(CREATE|READ|UPDATE|DELETE)$/.test(p));
console.log('3. distinct permission strings       :', all.length);
console.log('   malformed (not resource:ACTION)   :', bad.length, bad.slice(0,8).join(', '));
const actions=[...new Set(all.filter(p=>p!=='*').map(p=>p.split(':')[1]))].sort();
console.log('   actions in use                    :', actions.join(', '));
fs.writeFileSync('permission-vocabulary.txt', all.join('\n')+'\n');
