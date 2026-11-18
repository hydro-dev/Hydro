const assert=require('node:assert/strict'),{test}=require('node:test');
const {fields,orderedPhotos,escapeSearch,paginateYears}=require('../packages/contest-album/model.ts');
test('album metadata validates real dates and consistent archive years',()=>{
 assert.deepEqual(fields({title:' 比赛 ',year:'2026',date:'2026-11-18',published:'on'}),{title:'比赛',year:2026,date:'2026-11-18',description:'',award:'',published:true});
 for(const input of [{title:''},{title:'a',year:1800},{title:'a',year:2026,date:'2026-02-30'},{title:'a',year:2026,date:'2026-99-99'},{title:'a',year:2025,date:'2026-01-01'}])assert.throws(()=>fields(input));
 assert.equal(fields({title:'没有注明日期',year:0}).year,0);
 assert.equal(fields({title:'草稿',year:2026}).published,false);
});

test('awards accept medals and an explicit empty selection, rejecting arbitrary display values',()=>{
 for(const award of ['gold','silver','bronze',''])assert.equal(fields({title:'比赛',award}).award,award);
 assert.equal(fields({title:'历史相册'}).award,'');
 for(const award of ['金牌','toString','constructor','<img onerror=alert(1)>'])assert.throws(()=>fields({title:'比赛',award}));
});
test('photo order and captions can change without accepting injected image sources',()=>{
 const rows=[{id:'a',src:'/file/3/a.jpg',caption:''},{id:'b',src:'/file/3/b.png',caption:''}];
 const next=orderedPhotos([{id:'b',src:'https://evil.invalid/x',caption:' 比赛现场 '},{id:'a'}],rows);
 assert.equal(next[0].src,'/file/3/b.png');assert.equal(next[0].caption,'比赛现场');assert.equal(next[1].id,'a');
 assert.equal(orderedPhotos([{id:'a'}],rows).length,1);
 for(const input of [[{id:'x'}],[{id:'a'},{id:'a'}],[{id:'a',caption:'x'.repeat(201)}],{}])assert.throws(()=>orderedPhotos(input,rows));
});
test('search metacharacters are treated as literal text',()=>{
 const text='ICPC [武汉] (2026) a+b?';assert.ok(new RegExp(escapeSearch(text)).test(text));assert.ok(!new RegExp(escapeSearch('.*')).test('anything'));
});

test('pagination keeps complete years together, including a year larger than the target',()=>{
 const years=[{year:2026,count:3},{year:2025,count:6},{year:2024,count:2},{year:2023,count:2},{year:2021,count:3}];
 assert.deepEqual(paginateYears(years),[[2026,2025,2024],[2023,2021]]);
 assert.deepEqual(paginateYears([{year:2027,count:40},...years]),[[2027],[2026,2025,2024],[2023,2021]]);
 assert.deepEqual(paginateYears([]),[]);
 assert.deepEqual(paginateYears([{year:0,count:1}]),[[0]]);
});
