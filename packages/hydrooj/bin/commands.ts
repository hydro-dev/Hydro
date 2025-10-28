import cac from 'cac';
import { getAddons } from '../src/options';

const argv = cac().parse();

if (!argv.args[0] || argv.args[0] === 'cli') {
    const hydro = require('../src/loader');
    (argv.args[0] === 'cli' ? hydro.loadCli : hydro.load)().catch((e) => {
        console.error(e);
        process.exit(1);
    });
} else {
    const cli = cac();
    require('../src/commands/install').register(cli);
    require('../src/commands/addon').register(cli);
    require('../src/commands/db').register(cli);
    require('../src/commands/patch').register(cli);
    require('../src/commands/diagnosis').register(cli);
    cli.help();
    cli.parse();
    if (!cli.matchedCommand) {
        const addons = getAddons();
        for (const i of addons) {
            try {
                require(`${i}/command.ts`).register(cli);
            } catch (e) {
                try {
                    require(`${i}/command.js`).register(cli);
                } catch (err) { }
            }
        }
        cli.parse();
        if (!cli.matchedCommand) {
            console.log('Unknown command.');
            cli.outputHelp();
        }
    }
}
