const nodemailer = require('nodemailer');
const options = require('../options');
const { SendMailError } = require('../error');

let transporter = null;
try {
    transporter = nodemailer.createTransport({
        host: options.VJ_SMTP_HOST,
        port: options.VJ_DB_PORT,
        secure: options.VJ_SMTP_SECURE,
        auth: {
            user: options.VJ_SMTP_USER,
            pass: options.VJ_SMTP_PASSWORD,
        },
    });
} catch (e) {
    console.error(e);
}

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
            t = await new Promise((resolve, reject) => {
                transporter.sendMail({
                    from: options.VJ_SMTP_FROM,
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
