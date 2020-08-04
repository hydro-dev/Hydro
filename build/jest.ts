/* eslint-disable import/no-extraneous-dependencies */
import spawn from 'cross-spawn';

const args = ['jest', '--coverage'];

const [, , argv2, argv3] = process.argv;

if (argv2 && !argv2.startsWith('-')) {
    args.push(argv2);
    if (argv3 && !argv3.startsWith('-')) {
        args.push('--collectCoverageFrom');
        if (argv3.endsWith('.ts')) {
            args.push(`**/${argv3}`);
        } else {
            args.push(`**/${argv3}/**/*.ts`);
        }
        args.push(...process.argv.slice(4));
    } else {
        args.push(...process.argv.slice(3));
    }
} else {
    args.push('packages/.+\\.spec\\.ts', ...process.argv.slice(2));
}

spawn('npx', args, { stdio: 'inherit' });
