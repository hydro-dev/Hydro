/* eslint-disable no-await-in-loop */
import {
    ProblemModel, RecordModel, sleep, STATUS, yaml,
} from 'hydrooj';

const TESTS = {
    'test1': `//Test 1
#include<cstdio>

using namespace std;

int main(){
    int a=1000000000,b=1;
    while(a)b<<=1,a--;
    printf("%d\\n",b);
    return 0;
}`,
    'test2': `//Test 2
#include<cstdio>

using namespace std;
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
    printf("%d\\n",ans);
    return 0;
}`,
    'test3': `
//Test 3
#include<cstdio>

using namespace std;
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
    printf("%d\\n",ans);
    return 0;
}`,
    'test4': `//Test 4
#include<cstdio>
#include<algorithm>
#include<set>

using namespace std;

const int MX=1000000;
int sed=0;
inline int rand(){return sed=(sed*sed*73+sed*233+19260817);}
int main(){
    set<int>S;
    for(int i=0;i<MX;i++)S.insert(rand());
    int ans=0;
    for(set<int>::iterator it=S.begin();it!=S.end();it++)ans^=*it;
    printf("%d\\n",ans);
    return 0;
}`,
    'test6-1': `//Test 6-1
#include<cstdio>

using namespace std;
const int MX=1<<25;
int a[MX];

inline unsigned int rand(){static unsigned int sed=0;return (sed=(sed*233+19260421))&(MX-1);}

int main(){
    for(int i=0;i<MX;i++)a[rand()]=i;
    return 0;
}`,
    'test6-2': `//Test 6-2
#include<cstdio>

using namespace std;
const int MX=1<<25;
int a[MX];

inline unsigned int rand(){static unsigned int sed=0;return (sed=(sed*(MX+1)+1025))&(MX-1);}

int main(){
    for(int i=0;i<MX;i++)a[rand()]=i;
    return 0;
}`,
    'test6-3': `//Test 6-3
#include<cstdio>

using namespace std;
const int MX=1<<25;
int a[MX];

inline unsigned int rand(){static unsigned int sed=0;return (sed=(sed*(MX+1)+1))&(MX-1);}

int main(){
    for(int i=0;i<MX;i++)a[rand()]=i;
    return 0;
}`,
    'test7-1': `//Test 7-1
#include<cstdio>

using namespace std;
typedef unsigned long long ull;

#define P 1000000007
const int MX=100000000;

int main(){
    ull ans=1;
    for(int i=1;i<MX;i++)ans=ans*i%P;
    printf("%llu\\n",ans);
    return 0;
}`,
    'test7-2': `//Test 7-2
#include<cstdio>

using namespace std;
typedef unsigned long long ull;

int P=1000000007;
const int MX=100000000;

int main(){
    ull ans=1;
    for(int i=1;i<MX;i++)ans=ans*i%P;
    printf("%llu\\n",ans);
    return 0;
}`,
    'test8': `//Test 8
#include<cstdio>

using namespace std;

const int MX=20000000;

int main(){
    double ans=0.61234567898765,t=1,s=0;
    for(int i=1;i<MX;i++)s+=(t*=ans);
    printf("%f\\n",s);
    return 0;
}`,
    'test9-1': `//Test 9-1
#include<cstdio>

using namespace std;
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
    printf("%u\\n",s);
    return 0;
}`,
    'test9-2': `//Test 9-2
#include<cstdio>

using namespace std;
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
    printf("%u\\n",s);
    return 0;
}`,
};

export async function startPerformanceTest(args, report) {
    const docId = (await ProblemModel.get('system', 'PTEST'))?.docId
        || await ProblemModel.add('system', 'PTEST', 'Performance Test', 'test only', 1, [], { hidden: true });
    await ProblemModel.addTestdata('system', docId, '1.in', Buffer.from('1'));
    await ProblemModel.addTestdata('system', docId, '1.out', Buffer.from(''));
    await ProblemModel.addTestdata('system', docId, 'config.yaml', Buffer.from(yaml.dump({
        time: '3s',
        memory: '256m',
        cases: new Array(20).fill({
            input: '1.in',
            output: '1.out',
        }),
    })));
    await Promise.all(Object.keys(TESTS).map(async (key) => {
        const id = await RecordModel.add('system', docId, 1, 'cc.cc14o2', TESTS[key], true);
        while ([
            STATUS.STATUS_WAITING, STATUS.STATUS_JUDGING, STATUS.STATUS_FETCHED, STATUS.STATUS_COMPILING,
        ].includes((await RecordModel.get('system', id))?.status)) {
            await sleep(500);
        }
        const result = await RecordModel.get('system', id);
        if (result.status !== STATUS.STATUS_ACCEPTED && result.status !== STATUS.STATUS_WRONG_ANSWER) {
            report({ message: `Test ${key} failed (${id}) ${result.status}` });
        }
        const timeArr = result.testCases.map((i) => i.time);
        const avgTime = Math.sum(...timeArr) / 20;
        report({ message: '' });
        report({ message: `Test ${key} Avg: ${Math.floor(avgTime)}` });
        report({ message: `Max: ${Math.floor(Math.max(...timeArr))} / Min: ${Math.floor(Math.min(...timeArr))}` });
        report({ message: `Variance: ${Math.floor(Math.sum(...timeArr.map((i) => (i - avgTime) ** 2)) / 20)}` });
        report({ message: '' });
    }));
    return true;
}
