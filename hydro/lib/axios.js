const axios = require('axios');

async function get(url, options) {
    let res;
    try {
        res = await axios.get(url, options);
    } catch (e) {
        res = e;
    }
    return res;
}

async function post(url, data, options) {
    let res;
    try {
        res = await axios.post(url, data, options);
    } catch (e) {
        res = e;
    }
    return res;
}

module.exports = { get, post };
