/* eslint-disable no-await-in-loop */
import {
    ProblemModel, RecordModel, sleep, STATUS, yaml,
} from 'hydrooj';

// These tests are from https://loj.ac/d/425
const head = '#include<cstdio>\nusing namespace std;\n';
const TESTS = {
    ' 1 ': `
int main(){
    int a=1000000000,b=1;
    while(a)b<<=1,a--;
    printf("%d\\n",b);`,

    ' 2 ': `
const int MX=50000000;
int p[MX],m[MX],pc;
int main(){
    for(int i=2;i<MX;i++){
        if(!m[i])p[++pc]=m[i]=i;
        static int k;
        for(int j=1;j<=pc&&p[j]<=m[i]&&(k=p[j]*i)<MX;j++)m[k]=p[j];
    }
    int ans=0;
    for(int i=1;i<=pc;i++)ans^=p[i];
    printf("%d\\n",ans);`,

    ' 3 ': `
const int MX=1000;
int G[MX][MX];
int sed=0;
inline int rand(){return sed=(sed*sed*73+sed*233+19260817)&0x0000ffff;}
int main(){
    for(int i=0;i<MX;i++)
        for(int j=0;j<MX;j++)
            G[i][j]=rand();
    for(int i=0;i<MX;i++)
        for(int j=0;j<MX;j++)
            for(int k=0;k<MX;k++)
                if(G[j][k]>G[j][i]+G[i][k])G[j][k]=G[j][i]+G[i][k];
    int ans=0;
    for(int i=0;i<MX;i++)
        for(int j=0;j<MX;j++)
            ans^=G[i][j];
    printf("%d\\n",ans);`,

    ' 4 ': `
#include<algorithm>
#include<set>
const int MX=1000000;
int sed=0;
inline int rand(){return sed=(sed*sed*73+sed*233+19260817);}
int main(){
    set<int>S;
    for(int i=0;i<MX;i++)S.insert(rand());
    int ans=0;
    for(set<int>::iterator it=S.begin();it!=S.end();it++)ans^=*it;
    printf("%d\\n",ans);`,

    // skipping test 5 by default as it contains a lot of ram
    ' 5 ': `
const int MX=20000000;
int *it[MX];
int main(){
    for(int i=0;i<MX;i++)it[i]=new int;
    for(int i=0;i<MX;i++)*it[i]=i;
    int ans=0;
    for(int i=0;i<MX;i++)ans^=*it[i];
    printf("%d\\n",ans);`,

    '6-1': `
const int MX=1<<25;
int a[MX];
inline unsigned int rand(){static unsigned int sed=0;return (sed=(sed*233+19260421))&(MX-1);}
int main(){
    for(int i=0;i<MX;i++)a[rand()]=i;`,

    '6-2': `
const int MX=1<<25;
int a[MX];
inline unsigned int rand(){static unsigned int sed=0;return (sed=(sed*(MX+1)+1025))&(MX-1);}
int main(){
    for(int i=0;i<MX;i++)a[rand()]=i;`,

    '6-3': `
const int MX=1<<25;
int a[MX];
inline unsigned int rand(){static unsigned int sed=0;return (sed=(sed*(MX+1)+1))&(MX-1);}
int main(){
    for(int i=0;i<MX;i++)a[rand()]=i;`,

    '7-1': `
typedef unsigned long long ull;
#define P 1000000007
const int MX=100000000;
int main(){
    ull ans=1;
    for(int i=1;i<MX;i++)ans=ans*i%P;
    printf("%llu\\n",ans);`,

    '7-2': `
typedef unsigned long long ull;
int P=1000000007;
const int MX=100000000;
int main(){
    ull ans=1;
    for(int i=1;i<MX;i++)ans=ans*i%P;
    printf("%llu\\n",ans);`,

    ' 8 ': `
const int MX=20000000;
int main(){
    double ans=0.61234567898765,t=1,s=0;
    for(int i=1;i<MX;i++)s+=(t*=ans);
    printf("%f\\n",s);`,

    '9-1': `
typedef unsigned int uint;
const int MX=1<<10;
uint a[MX][MX],b[MX][MX];
inline uint rand(){static unsigned int sed=0;return (sed=(sed*233+19260421))&(MX-1);}
int main(){
    register int i,j,k;
    for(i=0;i<MX;i++)
        for(j=0;j<MX;j++)
            a[i][j]=rand();
    #define A(t) (b[i][k+t]+=a[i][j]*a[j][k+t])
    for(i=0;i<MX;i++)
        for(j=0;j<MX;j++)
            for(k=0;k<MX;k++)
                A(0);
    #undef A
    uint s;
    for(i=0;i<MX;i++)
        for(j=0;j<MX;j++)
            s+=a[i][j];
    printf("%u\\n",s);`,

    '9-2': `
typedef unsigned int uint;
const int MX=1<<10;
uint a[MX][MX],b[MX][MX];
inline uint rand(){static unsigned int sed=0;return (sed=(sed*233+19260421))&(MX-1);}
int main(){
    register int i,j,k;
    for(i=0;i<MX;i++)
        for(j=0;j<MX;j++)
            a[i][j]=rand();
    #define A(t) (b[i][k+t]+=a[i][j]*a[j][k+t])
    for(i=0;i<MX;i++)
        for(j=0;j<MX;j++)
            for(k=0;k<MX;k+=8)
                A(0),A(1),A(2),A(3),A(4),A(5),A(6),A(7);
    #undef A
    uint s;
    for(i=0;i<MX;i++)
        for(j=0;j<MX;j++)
            s+=a[i][j];
    printf("%u\\n",s);`,
};

export async function startPerformanceTest(args: { enable5: boolean }, report) {
    const docId = (await ProblemModel.get('system', 'PTEST'))?.docId
        || await ProblemModel.add('system', 'PTEST', 'Performance Test', 'test only', 1, [], { hidden: true });
    await ProblemModel.addTestdata('system', docId, '1.in', Buffer.from('1'));
    await ProblemModel.addTestdata('system', docId, '1.out', Buffer.from(''));
    await ProblemModel.addTestdata('system', docId, 'config.yaml', Buffer.from(yaml.dump({
        time: '3s',
        memory: args.enable5 ? '2g' : '512m',
        cases: Array.from({ length: 20 }).fill({
            input: '1.in',
            output: '1.out',
        }),
    })));
    report({ message: 'Running tests...' });
    const results = {};
    await Promise.all(Object.keys(TESTS).map(async (key) => {
        if (key === ' 5 ' && !args.enable5) return;
        const id = await RecordModel.add('system', docId, 1, 'cc.cc14o2', `// TEST ${key}\n${head}${TESTS[key]}\nreturn 0;}`, true);
        while ([
            STATUS.STATUS_WAITING, STATUS.STATUS_JUDGING, STATUS.STATUS_FETCHED, STATUS.STATUS_COMPILING,
        ].includes((await RecordModel.get('system', id))?.status)) {
            await sleep(500);
        }
        const result = await RecordModel.get('system', id);
        if (result.status !== STATUS.STATUS_ACCEPTED && result.status !== STATUS.STATUS_WRONG_ANSWER) {
            report({ message: `Test ${key} failed (${id}) ${result.status}` });
        } else {
            results[key] = result.testCases.map((i) => i.time);
        }
    }));
    const formatL = (t: number, width = 4) => Math.floor(t).toString().padEnd(width);
    const formatR = (t: number, width = 4) => Math.floor(t).toString().padStart(width);
    for (const key of Object.keys(TESTS)) {
        const timeArr = results[key];
        if (!timeArr) continue;
        const avgTime = Math.sum(...timeArr) / 20;
        await report({
            message: [
                `-------Test ${key}-------`,
                ` Avg: ${formatL(avgTime)}  D:  ${formatR(Math.sum(...timeArr.map((i) => (i - avgTime) ** 2)) / 20, 5)} `,
                ` Max: ${formatL(Math.max(...timeArr))}  Min: ${formatR(Math.min(...timeArr))} `,
            ].join('\n'),
        });
    }
    return true;
}
