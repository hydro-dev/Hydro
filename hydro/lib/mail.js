const nodemailer = require('nodemailer');
const { SendMailError } = require('../error');

module.exports = {
    /**
     * @param {string} to
     * @param {string} subject
     * @param {string} text
     * @param {string} html
     */
    async sendMail(to, subject, text, html) {
        let t;
        try {
            const system = require('../model/system');
            const [host, port, secure, user, pass, from] = await Promise.all([
                system.get('smtp.host'),
                system.get('smtp.port'),
                system.get('smtp.secure'),
                system.get('smtp.user'),
                system.get('smtp.pass'),
                system.get('smtp.from'),
            ]);
            const transporter = nodemailer.createTransport({
                host, port, secure, auth: { user, pass },
            });
            t = await new Promise((resolve, reject) => {
                transporter.sendMail({
                    from,
                    to,
                    subject,
                    text,
                    html,
                }, (err, info) => {
                    if (err) reject(err);
                    else resolve(info);
                });
            });
        } catch (e) {
            throw new SendMailError(to);
        }
        return t;
    },
};
