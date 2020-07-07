import Zip from 'adm-zip';

async function readConfig(filePath: string) {
    const data = new Zip(filePath);
    const entries = data.getEntries();
    for (const entry of entries) {
        if (entry.name.toLowerCase() === 'config.yaml') {
            return entry.getData().toString();
        }
        if (entry.name.toLowerCase() === 'config.ini') {
            const ini = entry.getData().toString();
            const conv = global.Hydro.lib['testdata.convert.ini'];
            return conv(ini);
        }
    }
    return '';
}

global.Hydro.lib.readConfig = readConfig;
export default readConfig;
