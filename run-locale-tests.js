// Standalone test runner for locale tests
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { describe, it } = require('node:test');

// Use dynamic import or require based on availability
let expect;
try {
    const chai = require('chai');
    expect = chai.expect;
} catch (e) {
    console.error('Chai not available, using basic assertions');
    expect = (val) => ({
        to: {
            be: {
                an: (type) => {
                    if (typeof val !== type) throw new Error(`Expected ${type}, got ${typeof val}`);
                },
                a: (type) => {
                    if (typeof val !== type) throw new Error(`Expected ${type}, got ${typeof val}`);
                },
                true: () => {
                    if (val !== true) throw new Error(`Expected true, got ${val}`);
                },
                empty: () => {
                    if (val.length !== 0) throw new Error(`Expected empty, got length ${val.length}`);
                },
                greaterThan: (n) => {
                    if (val <= n) throw new Error(`Expected > ${n}, got ${val}`);
                }
            },
            have: {
                length: {
                    greaterThan: (n) => {
                        if (val.length <= n) throw new Error(`Expected length > ${n}, got ${val.length}`);
                    }
                }
            },
            equal: (expected) => {
                if (val !== expected) throw new Error(`Expected ${expected}, got ${val}`);
            },
            not: {
                throw: () => {
                    try {
                        val();
                    } catch (e) {
                        throw new Error(`Expected not to throw, but threw: ${e.message}`);
                    }
                },
                include: (str) => {
                    if (val.includes(str)) throw new Error(`Expected not to include ${str}`);
                },
                be: {
                    null: () => {
                        if (val === null) throw new Error('Expected not to be null');
                    }
                }
            },
            match: (regex) => {
                if (!regex.test(val)) throw new Error(`Expected to match ${regex}`);
            }
        }
    });
}

// Load the test file
require('./packages/hydrooj/tests/locale.spec.ts');