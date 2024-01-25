const superagent = require('superagent');
const secret = process.env.GITHUB_TOKEN;
async function main() {
    const res = await superagent.get('https://api.github.com/repos/hydro-dev/Hydro/actions/caches')
        .set('Accept', 'application/vnd.github+json')
        .set('User-Agent', 'Hydro')
        .set('Authorization', `Bearer ${secret}`);
    console.log(`Total ${res.body.total_count}`);
    console.log(res.body.actions_caches.map((i) => i.key));
    await Promise.all(res.body.actions_caches.map((i) => superagent
        .delete(`https://api.github.com/repos/hydro-dev/Hydro/actions/caches?key=${i.key}`)
        .set('Accept', 'application/vnd.github+json')
        .set('User-Agent', 'Hydro')
        .set('Authorization', `Bearer ${secret}`)));
}
main();
