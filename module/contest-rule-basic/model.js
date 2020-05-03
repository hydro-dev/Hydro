const acm = require('./acm');
const oi = require('./oi');

const rules = global.Hydro['model.contest'].RULES;
rules.oi = oi;
rules.acm = acm;
